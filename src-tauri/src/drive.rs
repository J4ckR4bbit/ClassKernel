// Google Drive v3 client — just the handful of calls the sync engine needs.
//
// Two things shape this file:
//
//  * The `drive.file` scope only ever shows us files this app created, so a
//    plain unfiltered `files.list` already returns exactly our own tree and
//    nothing of the teacher's other documents.
//  * Every file and folder we create carries its path relative to the data
//    folder in `appProperties.ck_rel_path`. That means the whole tree can be
//    read back with one flat, paginated listing instead of a recursive walk —
//    and the future Android app can do the same.

use serde::{Deserialize, Serialize};
use std::time::Duration;

const FILES_API: &str = "https://www.googleapis.com/drive/v3/files";
const UPLOAD_API: &str = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER_MIME: &str = "application/vnd.google-apps.folder";
const FILE_FIELDS: &str = "id,name,mimeType,md5Checksum,modifiedTime,trashed,appProperties";

/// Marks a file as belonging to one ClassKernel folder, so two data folders
/// synced from the same Google account never bleed into each other.
const PROP_ROOT: &str = "ck_root";
const PROP_REL_PATH: &str = "ck_rel_path";

#[derive(Debug, Clone, Serialize)]
pub struct DriveFileMeta {
    pub id: String,
    pub name: String,
    #[serde(rename = "isFolder")]
    pub is_folder: bool,
    pub md5: Option<String>,
    #[serde(rename = "modifiedTime")]
    pub modified_time: String,
    #[serde(rename = "relPath")]
    pub rel_path: Option<String>,
    pub trashed: bool,
}

#[derive(Deserialize)]
struct RawFile {
    id: String,
    #[serde(default)]
    name: String,
    #[serde(rename = "mimeType", default)]
    mime_type: String,
    #[serde(rename = "md5Checksum", default)]
    md5_checksum: Option<String>,
    #[serde(rename = "modifiedTime", default)]
    modified_time: Option<String>,
    #[serde(default)]
    trashed: bool,
    #[serde(rename = "appProperties", default)]
    app_properties: Option<std::collections::HashMap<String, String>>,
}

impl From<RawFile> for DriveFileMeta {
    fn from(r: RawFile) -> Self {
        let rel_path = r
            .app_properties
            .as_ref()
            .and_then(|p| p.get(PROP_REL_PATH).cloned());
        DriveFileMeta {
            is_folder: r.mime_type == FOLDER_MIME,
            id: r.id,
            name: r.name,
            md5: r.md5_checksum,
            modified_time: r.modified_time.unwrap_or_default(),
            rel_path,
            trashed: r.trashed,
        }
    }
}

#[derive(Deserialize)]
struct FileList {
    #[serde(default)]
    files: Vec<RawFile>,
    #[serde(rename = "nextPageToken", default)]
    next_page_token: Option<String>,
}

// ---------- request plumbing ----------

fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .unwrap_or_default()
}

/// True for the failures that are worth trying again: Drive's rate limiter and
/// transient server errors. Everything else (401, 404, bad request) will fail
/// identically on a retry, so it is surfaced immediately.
fn is_retryable(status: reqwest::StatusCode) -> bool {
    status == reqwest::StatusCode::TOO_MANY_REQUESTS || status.is_server_error()
}

async fn send_with_retry<F>(build: F) -> Result<reqwest::Response, String>
where
    F: Fn() -> reqwest::RequestBuilder,
{
    let mut delay = Duration::from_millis(500);
    for attempt in 0..4 {
        match build().send().await {
            Ok(response) => {
                if attempt < 3 && is_retryable(response.status()) {
                    tokio::time::sleep(delay).await;
                    delay *= 2;
                    continue;
                }
                return Ok(response);
            }
            Err(e) => {
                if attempt == 3 {
                    return Err(format!("Couldn't reach Google Drive: {e}"));
                }
                tokio::time::sleep(delay).await;
                delay *= 2;
            }
        }
    }
    Err("Couldn't reach Google Drive.".into())
}

async fn read_json<T: serde::de::DeserializeOwned>(
    response: reqwest::Response,
    what: &str,
) -> Result<T, String> {
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("Google Drive {what} failed ({status}): {body}"));
    }
    serde_json::from_str(&body).map_err(|e| format!("Unexpected Drive reply for {what}: {e}"))
}

fn escape_query(value: &str) -> String {
    value.replace('\\', "\\\\").replace('\'', "\\'")
}

// ---------- operations ----------

/// Find this app's folder by name at the top of My Drive, or create it.
/// Under `drive.file` the search only sees folders we created ourselves, so
/// this cannot latch onto some unrelated folder of the teacher's.
pub async fn ensure_root_folder(token: &str, name: &str) -> Result<DriveFileMeta, String> {
    let query = format!(
        "name = '{}' and mimeType = '{FOLDER_MIME}' and trashed = false and 'root' in parents",
        escape_query(name)
    );
    let response = send_with_retry(|| {
        client()
            .get(FILES_API)
            .bearer_auth(token)
            .query(&[
                ("q", query.as_str()),
                ("fields", "files(id,name,mimeType,modifiedTime,trashed)"),
                ("pageSize", "10"),
            ])
    })
    .await?;
    let list: FileList = read_json(response, "folder lookup").await?;
    if let Some(existing) = list.files.into_iter().next() {
        return Ok(existing.into());
    }

    let metadata = serde_json::json!({
        "name": name,
        "mimeType": FOLDER_MIME,
        "parents": ["root"],
    });
    let response = send_with_retry(|| {
        client()
            .post(FILES_API)
            .bearer_auth(token)
            .query(&[("fields", FILE_FIELDS)])
            .json(&metadata)
    })
    .await?;
    let created: RawFile = read_json(response, "folder create").await?;
    Ok(created.into())
}

/// Every file and folder tagged as belonging to this root, in one flat list.
pub async fn list_tree(token: &str, root_id: &str) -> Result<Vec<DriveFileMeta>, String> {
    let query = format!(
        "trashed = false and appProperties has {{ key='{PROP_ROOT}' and value='{}' }}",
        escape_query(root_id)
    );
    let mut out = Vec::new();
    let mut page_token: Option<String> = None;
    loop {
        let query = query.clone();
        let token_param = page_token.clone();
        let response = send_with_retry(move || {
            let mut request = client()
                .get(FILES_API)
                .bearer_auth(token)
                .query(&[
                    ("q", query.as_str()),
                    ("fields", "nextPageToken,files(id,name,mimeType,md5Checksum,modifiedTime,trashed,appProperties)"),
                    ("pageSize", "1000"),
                    ("spaces", "drive"),
                ]);
            if let Some(t) = token_param.as_deref() {
                request = request.query(&[("pageToken", t)]);
            }
            request
        })
        .await?;
        let list: FileList = read_json(response, "listing").await?;
        out.extend(list.files.into_iter().map(DriveFileMeta::from));
        match list.next_page_token {
            Some(t) => page_token = Some(t),
            None => break,
        }
    }
    Ok(out)
}

pub async fn create_folder(
    token: &str,
    name: &str,
    parent_id: &str,
    rel_path: &str,
    root_id: &str,
) -> Result<DriveFileMeta, String> {
    let metadata = serde_json::json!({
        "name": name,
        "mimeType": FOLDER_MIME,
        "parents": [parent_id],
        "appProperties": { PROP_ROOT: root_id, PROP_REL_PATH: rel_path },
    });
    let response = send_with_retry(|| {
        client()
            .post(FILES_API)
            .bearer_auth(token)
            .query(&[("fields", FILE_FIELDS)])
            .json(&metadata)
    })
    .await?;
    let created: RawFile = read_json(response, "folder create").await?;
    Ok(created.into())
}

fn mime_for(name: &str) -> &'static str {
    if name.ends_with(".csv") {
        "text/csv"
    } else if name.ends_with(".md") {
        "text/markdown"
    } else if name.ends_with(".json") {
        "application/json"
    } else {
        "text/plain"
    }
}

/// Create or replace a file's contents in one multipart/related request.
/// Our files are small CSV/markdown, so a resumable upload would be overkill.
#[allow(clippy::too_many_arguments)]
pub async fn upload(
    token: &str,
    file_id: Option<&str>,
    name: &str,
    parent_id: &str,
    rel_path: &str,
    root_id: &str,
    content: &str,
) -> Result<DriveFileMeta, String> {
    // On update Drive rejects `parents` in the metadata, so only send it when
    // creating the file.
    let metadata = if file_id.is_some() {
        serde_json::json!({
            "name": name,
            "appProperties": { PROP_ROOT: root_id, PROP_REL_PATH: rel_path },
        })
    } else {
        serde_json::json!({
            "name": name,
            "parents": [parent_id],
            "appProperties": { PROP_ROOT: root_id, PROP_REL_PATH: rel_path },
        })
    };

    let boundary = "ck-boundary-8f2a1c7d4e6b";
    let body = format!(
        "--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{}\r\n\
         --{boundary}\r\nContent-Type: {}; charset=UTF-8\r\n\r\n{}\r\n--{boundary}--\r\n",
        metadata,
        mime_for(name),
        content
    );
    let content_type = format!("multipart/related; boundary={boundary}");

    let response = send_with_retry(|| {
        let http = client();
        let request = match file_id {
            Some(id) => http.patch(format!("{UPLOAD_API}/{id}")),
            None => http.post(UPLOAD_API),
        };
        request
            .bearer_auth(token)
            .query(&[("uploadType", "multipart"), ("fields", FILE_FIELDS)])
            .header(reqwest::header::CONTENT_TYPE, content_type.clone())
            .body(body.clone())
    })
    .await?;
    let saved: RawFile = read_json(response, "upload").await?;
    Ok(saved.into())
}

pub async fn download(token: &str, file_id: &str) -> Result<String, String> {
    let response = send_with_retry(|| {
        client()
            .get(format!("{FILES_API}/{file_id}"))
            .bearer_auth(token)
            .query(&[("alt", "media")])
    })
    .await?;
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("Google Drive download failed ({status}): {body}"));
    }
    Ok(body)
}

/// Trash rather than hard-delete: a sync bug should always be recoverable from
/// the teacher's Drive bin.
pub async fn trash(token: &str, file_id: &str) -> Result<(), String> {
    let response = send_with_retry(|| {
        client()
            .patch(format!("{FILES_API}/{file_id}"))
            .bearer_auth(token)
            .json(&serde_json::json!({ "trashed": true }))
    })
    .await?;
    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Google Drive delete failed ({status}): {body}"));
    }
    Ok(())
}
