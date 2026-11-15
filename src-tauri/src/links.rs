// Links that lead out of the app. Kept free of Tauri so its tests run with a
// plain `rustc --test src-tauri/src/links.rs`.
//
// A class's notes are Markdown and can hold links. Followed inside the app's
// window, a link would replace ClassKernel with a web page and leave no way
// back, so lib.rs opens these in the computer's own browser (or mail program)
// instead. The app's own pages are served from a localhost address or a
// non-web scheme (tauri://, about:), which never count as outside.

/// Whether an address the window is about to open is outside the app.
pub fn is_external(scheme: &str, host: Option<&str>) -> bool {
    match scheme {
        "mailto" => true,
        "http" | "https" => !host.is_some_and(is_local),
        _ => false,
    }
}

fn is_local(host: &str) -> bool {
    let host = host.to_ascii_lowercase();
    host == "localhost" || host.ends_with(".localhost") || host == "127.0.0.1" || host == "[::1]"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_apps_own_pages_stay_in_the_window() {
        // Windows, macOS and Linux, and `tauri dev`.
        assert!(!is_external("http", Some("tauri.localhost")));
        assert!(!is_external("https", Some("tauri.localhost")));
        assert!(!is_external("tauri", Some("localhost")));
        assert!(!is_external("http", Some("localhost")));
        assert!(!is_external("http", Some("127.0.0.1")));
        assert!(!is_external("about", None));
        assert!(!is_external("blob", None));
    }

    #[test]
    fn web_and_mail_links_open_outside() {
        assert!(is_external("https", Some("www.example.com")));
        assert!(is_external("http", Some("example.com")));
        assert!(is_external("https", Some("localhost.example.com")));
        assert!(is_external("mailto", None));
        assert!(is_external("https", None));
    }
}
