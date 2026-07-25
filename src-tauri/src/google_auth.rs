// Google sign-in for Drive sync: the OAuth 2.0 "installed app" flow — a
// loopback redirect on 127.0.0.1 plus PKCE, which is what Google prescribes for
// desktop apps.
//
// Token handling, in short:
//   * the refresh token goes to the OS credential store (keyring), never to
//     the data folder — that folder is deliberately plain files the teacher can
//     open in Excel, and is often itself inside a sync client;
//   * the access token lives in memory only, and never crosses into JS.

use base64::Engine;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::Mutex;
use std::time::{Duration, Instant};

const AUTH_ENDPOINT: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT: &str = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT: &str = "https://oauth2.googleapis.com/revoke";

/// `drive.file` is Google's non-sensitive Drive scope: it reaches only files
/// this app created, and needs no verification review or CASA security
/// assessment. `openid email` is just so the UI can name the connected account.
const SCOPES: &str = "openid email https://www.googleapis.com/auth/drive.file";

const KEYRING_SERVICE: &str = "ClassKernel";
const KEYRING_USER: &str = "google-refresh-token";

/// How long to wait for the teacher to finish the consent screen.
const CONSENT_TIMEOUT: Duration = Duration::from_secs(300);

// ---------- credentials ----------

#[derive(Clone, Deserialize)]
pub struct ClientCredentials {
    pub client_id: String,
    pub client_secret: String,
}

/// Baked in at build time (see build.rs), or overridden at runtime by
/// `<config dir>/google_client.json` so credentials can be swapped while
/// testing without a rebuild.
pub fn client_credentials(app: &tauri::AppHandle) -> Result<ClientCredentials, String> {
    if let Ok(path) = crate::config_dir(app) {
        let override_path = path.join("google_client.json");
        if override_path.is_file() {
            let text = std::fs::read_to_string(&override_path)
                .map_err(|e| format!("{}: {e}", override_path.display()))?;
            return serde_json::from_str(&text)
                .map_err(|e| format!("{}: {e}", override_path.display()));
        }
    }
    match (
        option_env!("CLASSKERNEL_GOOGLE_CLIENT_ID"),
        option_env!("CLASSKERNEL_GOOGLE_CLIENT_SECRET"),
    ) {
        (Some(id), Some(secret)) if !id.is_empty() && !secret.is_empty() => Ok(ClientCredentials {
            client_id: id.to_string(),
            client_secret: secret.to_string(),
        }),
        _ => Err(
            "This build has no Google client configured, so Drive sync is unavailable. \
             See docs/google-drive-setup.md."
                .into(),
        ),
    }
}

pub fn is_configured(app: &tauri::AppHandle) -> bool {
    client_credentials(app).is_ok()
}

// ---------- in-memory session ----------

#[derive(Default)]
pub struct AuthState {
    inner: Mutex<Session>,
}

#[derive(Default)]
struct Session {
    access_token: Option<String>,
    expires_at: Option<Instant>,
    email: Option<String>,
}

impl AuthState {
    fn cached_token(&self) -> Option<String> {
        let s = self.inner.lock().ok()?;
        let expires = s.expires_at?;
        // 60s of slack so a request never starts with a token about to expire.
        if Instant::now() + Duration::from_secs(60) < expires {
            s.access_token.clone()
        } else {
            None
        }
    }

    fn store(&self, token: &str, expires_in: u64, email: Option<String>) {
        if let Ok(mut s) = self.inner.lock() {
            s.access_token = Some(token.to_string());
            s.expires_at = Some(Instant::now() + Duration::from_secs(expires_in));
            if email.is_some() {
                s.email = email;
            }
        }
    }

    pub fn email(&self) -> Option<String> {
        self.inner.lock().ok().and_then(|s| s.email.clone())
    }

    fn clear(&self) {
        if let Ok(mut s) = self.inner.lock() {
            *s = Session::default();
        }
    }
}

// ---------- refresh token storage ----------

fn keyring_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| e.to_string())
}

fn save_refresh_token(token: &str) -> Result<(), String> {
    keyring_entry()?.set_password(token).map_err(|e| e.to_string())
}

pub fn load_refresh_token() -> Option<String> {
    match keyring_entry().ok()?.get_password() {
        Ok(t) => Some(t),
        Err(_) => None,
    }
}

fn clear_refresh_token() {
    if let Ok(entry) = keyring_entry() {
        let _ = entry.delete_credential();
    }
}

// ---------- PKCE helpers ----------

fn random_urlsafe(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    rand::thread_rng().fill_bytes(&mut buf);
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(buf)
}

fn code_challenge(verifier: &str) -> String {
    let digest = Sha256::digest(verifier.as_bytes());
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(digest)
}

/// Pull the email out of the id_token without verifying it. That is safe here:
/// the token came straight back from Google's token endpoint over TLS, and it
/// is only used to label the account in the UI — never for authorisation.
fn email_from_id_token(id_token: &str) -> Option<String> {
    let payload = id_token.split('.').nth(1)?;
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(payload)
        .ok()?;
    let claims: serde_json::Value = serde_json::from_slice(&bytes).ok()?;
    claims
        .get("email")
        .and_then(|v| v.as_str())
        .map(str::to_string)
}

// ---------- loopback listener ----------

struct Redirect {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
}

const DONE_PAGE: &str = "<!doctype html><meta charset=utf-8><title>ClassKernel</title>\
<body style=\"font-family:system-ui;text-align:center;padding-top:4rem;color:#222\">\
<h2>ClassKernel is connected</h2><p>You can close this tab and go back to the app.</p>";

/// Serve exactly one useful request on the loopback port and return what the
/// browser handed back. Browsers also probe /favicon.ico, so keep going until a
/// request actually carries `code` or `error`.
fn await_redirect(listener: TcpListener) -> Result<Redirect, String> {
    listener
        .set_nonblocking(false)
        .map_err(|e| format!("loopback listener: {e}"))?;
    let deadline = Instant::now() + CONSENT_TIMEOUT;

    for stream in listener.incoming() {
        if Instant::now() > deadline {
            return Err("Timed out waiting for Google sign-in.".into());
        }
        let mut stream = match stream {
            Ok(s) => s,
            Err(e) => return Err(format!("loopback listener: {e}")),
        };
        let _ = stream.set_read_timeout(Some(Duration::from_secs(10)));

        // Only the request line matters, and it arrives in the first packet.
        let mut buf = [0u8; 4096];
        let read = stream.read(&mut buf).unwrap_or(0);
        let request = String::from_utf8_lossy(&buf[..read]);
        let target = request
            .lines()
            .next()
            .and_then(|line| line.split_whitespace().nth(1))
            .unwrap_or("/");

        let mut redirect = Redirect { code: None, state: None, error: None };
        if let Some(query) = target.split_once('?').map(|(_, q)| q) {
            for pair in query.split('&') {
                let (k, v) = match pair.split_once('=') {
                    Some(kv) => kv,
                    None => continue,
                };
                let value = urlencoding::decode(v).unwrap_or_default().into_owned();
                match k {
                    "code" => redirect.code = Some(value),
                    "state" => redirect.state = Some(value),
                    "error" => redirect.error = Some(value),
                    _ => {}
                }
            }
        }

        let interesting = redirect.code.is_some() || redirect.error.is_some();
        let body = if interesting { DONE_PAGE } else { "" };
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        );
        let _ = stream.write_all(response.as_bytes());
        let _ = stream.flush();

        if interesting {
            return Ok(redirect);
        }
    }
    Err("Sign-in was cancelled.".into())
}

// ---------- token exchange ----------

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    #[serde(default)]
    expires_in: Option<u64>,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default)]
    id_token: Option<String>,
}

#[derive(Serialize)]
pub struct AccountInfo {
    pub email: Option<String>,
    pub connected: bool,
    pub configured: bool,
}

async fn post_token(form: &[(&str, &str)]) -> Result<TokenResponse, String> {
    let response = reqwest::Client::new()
        .post(TOKEN_ENDPOINT)
        .form(form)
        .send()
        .await
        .map_err(|e| format!("Couldn't reach Google: {e}"))?;
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("Google rejected the sign-in ({status}): {body}"));
    }
    serde_json::from_str(&body).map_err(|e| format!("Unexpected reply from Google: {e}"))
}

/// Run the full consent flow. Returns the signed-in email address.
pub async fn sign_in(app: &tauri::AppHandle, state: &AuthState) -> Result<String, String> {
    let creds = client_credentials(app)?;

    // Port 0 = let the OS pick a free one; the port is part of the redirect URI.
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("Couldn't open a local port for sign-in: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| e.to_string())?
        .port();
    let redirect_uri = format!("http://127.0.0.1:{port}");

    let verifier = random_urlsafe(64);
    let challenge = code_challenge(&verifier);
    let expected_state = random_urlsafe(24);

    let url = format!(
        "{AUTH_ENDPOINT}?client_id={}&redirect_uri={}&response_type=code&scope={}\
         &code_challenge={}&code_challenge_method=S256&state={}&access_type=offline&prompt=consent",
        urlencoding::encode(&creds.client_id),
        urlencoding::encode(&redirect_uri),
        urlencoding::encode(SCOPES),
        urlencoding::encode(&challenge),
        urlencoding::encode(&expected_state),
    );

    // access_type=offline + prompt=consent are what guarantee a refresh token
    // comes back; without them a re-consent returns only an access token and
    // sync would silently stop working an hour later.
    opener::open_browser(&url).map_err(|e| format!("Couldn't open your browser: {e}"))?;

    let redirect = tokio::time::timeout(
        CONSENT_TIMEOUT + Duration::from_secs(5),
        tokio::task::spawn_blocking(move || await_redirect(listener)),
    )
    .await
    .map_err(|_| "Timed out waiting for Google sign-in.".to_string())?
    .map_err(|e| format!("Sign-in task failed: {e}"))??;

    if let Some(error) = redirect.error {
        return Err(if error == "access_denied" {
            "Sign-in was declined.".into()
        } else {
            format!("Google returned an error: {error}")
        });
    }
    if redirect.state.as_deref() != Some(expected_state.as_str()) {
        return Err("Sign-in could not be verified (state mismatch). Please try again.".into());
    }
    let code = redirect
        .code
        .ok_or_else(|| "Google did not return an authorisation code.".to_string())?;

    let tokens = post_token(&[
        ("client_id", creds.client_id.as_str()),
        ("client_secret", creds.client_secret.as_str()),
        ("code", code.as_str()),
        ("code_verifier", verifier.as_str()),
        ("grant_type", "authorization_code"),
        ("redirect_uri", redirect_uri.as_str()),
    ])
    .await?;

    let refresh = tokens.refresh_token.ok_or_else(|| {
        "Google did not return a refresh token, so the app could not stay signed in. \
         Remove ClassKernel at myaccount.google.com/permissions and try again."
            .to_string()
    })?;
    save_refresh_token(&refresh)?;

    let email = tokens.id_token.as_deref().and_then(email_from_id_token);
    state.store(
        &tokens.access_token,
        tokens.expires_in.unwrap_or(3600),
        email.clone(),
    );
    Ok(email.unwrap_or_else(|| "your Google account".into()))
}

/// A usable access token: the cached one, or a fresh one from the refresh token.
pub async fn access_token(app: &tauri::AppHandle, state: &AuthState) -> Result<String, String> {
    if let Some(token) = state.cached_token() {
        return Ok(token);
    }
    let creds = client_credentials(app)?;
    let refresh = load_refresh_token()
        .ok_or_else(|| "Not signed in to Google.".to_string())?;

    let tokens = post_token(&[
        ("client_id", creds.client_id.as_str()),
        ("client_secret", creds.client_secret.as_str()),
        ("refresh_token", refresh.as_str()),
        ("grant_type", "refresh_token"),
    ])
    .await
    .map_err(|e| {
        // A revoked or expired refresh token can never recover on retry, so
        // drop it and make the UI ask for a fresh sign-in.
        if e.contains("invalid_grant") {
            clear_refresh_token();
            state.clear();
            "Google sign-in has expired. Please connect again.".to_string()
        } else {
            e
        }
    })?;

    let email = tokens.id_token.as_deref().and_then(email_from_id_token);
    state.store(&tokens.access_token, tokens.expires_in.unwrap_or(3600), email);
    Ok(tokens.access_token)
}

pub async fn sign_out(state: &AuthState) {
    if let Some(refresh) = load_refresh_token() {
        // Best-effort: if the network is down we still forget it locally.
        let _ = reqwest::Client::new()
            .post(REVOKE_ENDPOINT)
            .form(&[("token", refresh.as_str())])
            .send()
            .await;
    }
    clear_refresh_token();
    state.clear();
}

pub fn account_info(app: &tauri::AppHandle, state: &AuthState) -> AccountInfo {
    AccountInfo {
        email: state.email(),
        connected: load_refresh_token().is_some(),
        configured: is_configured(app),
    }
}
