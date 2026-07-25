fn main() {
    // Bake the Google OAuth client into the binary when the build environment
    // supplies one. Google documents that a "Desktop app" client's secret is
    // not treated as confidential — the loopback + PKCE flow is what actually
    // protects the exchange — so shipping it in the installer is the intended
    // model. It still goes in via env/CI secret rather than into git.
    //
    // Both are optional: a build without them still succeeds, and the app just
    // shows Google Drive sync as unavailable. That keeps `cargo build` working
    // for contributors and for CI runs with no secrets configured.
    for var in ["CLASSKERNEL_GOOGLE_CLIENT_ID", "CLASSKERNEL_GOOGLE_CLIENT_SECRET"] {
        println!("cargo:rerun-if-env-changed={var}");
        if let Ok(value) = std::env::var(var) {
            println!("cargo:rustc-env={var}={value}");
        }
    }
    tauri_build::build()
}
