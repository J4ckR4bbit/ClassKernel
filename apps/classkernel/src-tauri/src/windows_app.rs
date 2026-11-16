// The app's two windows: ClassKernel (label "main") and ClassKernel Science
// (label "science"), the science teaching tools, in one process.
//
// Neither is created at startup by tauri.conf.json ("create": false): the
// command line says which to open. `ClassKernel.exe` opens ClassKernel;
// `ClassKernel.exe --science` (Science's own shortcuts, made by the installer
// in windows/hooks.nsh) opens only Science. A second launch while the app is
// running reaches the running copy instead (the single-instance plugin), which
// opens or brings forward the window it asked for. Closing one window leaves
// the other running; the app ends with its last window.
//
// Science has its own icon and its own taskbar identity (SCIENCE_APP_ID, the
// same id its shortcuts carry), so it gets a taskbar button of its own and a
// pin starts Science rather than ClassKernel.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub use crate::launch::wants_science;

pub const MAIN: &str = "main";
pub const SCIENCE: &str = "science";
/// Must match SCIENCE_APP_ID in windows/hooks.nsh.
#[cfg_attr(not(windows), allow(dead_code))]
const SCIENCE_APP_ID: &str = "com.classkernel.science";

/// Bring an existing window to the front.
fn raise(window: &WebviewWindow) {
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
}

/// Each window opens hidden and its page shows it once it has drawn in the
/// right colours, so a dark theme doesn't flash white. Should the page never
/// get that far, show it anyway.
fn show_soon_anyway(window: WebviewWindow) {
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(4));
        if !window.is_visible().unwrap_or(true) {
            let _ = window.show();
        }
    });
}

/// Open ClassKernel's window, or bring it forward.
pub fn open_main(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(MAIN) {
        raise(&window);
        return Ok(());
    }
    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|w| w.label == MAIN)
        .cloned()
        .ok_or_else(|| tauri::Error::WindowNotFound)?;
    let window = WebviewWindowBuilder::from_config(app, &config)?.build()?;
    show_soon_anyway(window);
    Ok(())
}

/// Open the Science window, or bring it forward.
pub fn open_science(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(SCIENCE) {
        raise(&window);
        return Ok(());
    }
    // Built into ClassKernel's own pages (dist/science/). Under `tauri dev`
    // it comes from Science's dev server instead: run `npm run dev:science`.
    let url = if cfg!(debug_assertions) {
        WebviewUrl::External("http://localhost:1430/".parse().expect("a valid address"))
    } else {
        WebviewUrl::App("science/index.html".into())
    };
    // Decoded when the app is built, so no image library ships in it.
    let icon = tauri::include_image!("./icons/science.png");
    let window = WebviewWindowBuilder::new(app, SCIENCE, url)
        .title("ClassKernel Science")
        .icon(icon)?
        .inner_size(1280.0, 820.0)
        .min_inner_size(900.0, 600.0)
        .visible(false)
        .build()?;
    #[cfg(windows)]
    if let Err(e) = taskbar::set_identity(app, &window) {
        eprintln!("Couldn't give the Science window its own taskbar button: {e}");
    }
    show_soon_anyway(window);
    Ok(())
}

/// ClassKernel's Tools: the ClassKernel Science card and Settings row.
/// Async, so the window is made off the main thread (on Windows a window made
/// from a synchronous command can deadlock).
#[tauri::command]
pub async fn open_science_window(app: AppHandle) -> Result<(), String> {
    open_science(&app).map_err(|e| e.to_string())
}

/// A second launch, handed over by the single-instance plugin. Its callback
/// runs on the event loop, where making a window can deadlock on Windows, so
/// the window is made on another thread.
pub fn on_second_launch(app: &AppHandle, args: Vec<String>) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let opened = if wants_science(&args) { open_science(&app) } else { open_main(&app) };
        if let Err(e) = opened {
            eprintln!("Couldn't open the window a second launch asked for: {e}");
        }
    });
}

#[cfg(windows)]
mod taskbar {
    use super::SCIENCE_APP_ID;
    use tauri::{AppHandle, Manager, WebviewWindow};
    use windows::Win32::System::Com::StructuredStorage::PROPVARIANT;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Storage::EnhancedStorage::{
        PKEY_AppUserModel_ID, PKEY_AppUserModel_RelaunchCommand, PKEY_AppUserModel_RelaunchDisplayNameResource,
        PKEY_AppUserModel_RelaunchIconResource,
    };
    use windows::Win32::UI::Shell::PropertiesSystem::{IPropertyStore, SHGetPropertyStoreForWindow};

    /// Give the Science window its own AppUserModelID, so the taskbar shows it
    /// as an app of its own, and say how to start it again, so a pin opens
    /// Science (`ClassKernel.exe --science`, with Science's icon).
    pub fn set_identity(app: &AppHandle, window: &WebviewWindow) -> Result<(), String> {
        let window = window.clone();
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let relaunch = format!("\"{}\" {}", exe.display(), crate::launch::SCIENCE_ARG);
        // science.ico sits beside the program once installed (a bundle
        // resource); without it, the program's own icon.
        let icon = app
            .path()
            .resource_dir()
            .map(|dir| dir.join("science.ico"))
            .ok()
            .filter(|p| p.exists())
            .map(|p| p.display().to_string())
            .unwrap_or_else(|| format!("{},0", exe.display()));
        let set = move || -> Result<(), String> {
            let hwnd = HWND(window.hwnd().map_err(|e| e.to_string())?.0 as _);
            unsafe {
                let store: IPropertyStore = SHGetPropertyStoreForWindow(hwnd).map_err(|e| e.to_string())?;
                let values = [
                    (&PKEY_AppUserModel_ID, SCIENCE_APP_ID),
                    (&PKEY_AppUserModel_RelaunchCommand, relaunch.as_str()),
                    (&PKEY_AppUserModel_RelaunchDisplayNameResource, "ClassKernel Science"),
                    (&PKEY_AppUserModel_RelaunchIconResource, icon.as_str()),
                ];
                for (key, value) in values {
                    store.SetValue(key, &PROPVARIANT::from(value)).map_err(|e| e.to_string())?;
                }
                store.Commit().map_err(|e| e.to_string())
            }
        };
        // The window's property store is a COM object of the UI thread.
        app.run_on_main_thread(move || {
            if let Err(e) = set() {
                eprintln!("Couldn't set the Science window's taskbar identity: {e}");
            }
        })
        .map_err(|e| e.to_string())
    }
}
