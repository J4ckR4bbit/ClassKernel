// What a launch asks for. Kept free of Tauri so its tests run with a plain
// `rustc --test src-tauri/src/launch.rs`.
//
// `ClassKernel.exe` opens ClassKernel; `ClassKernel.exe --science` (ClassKernel
// Science's own shortcuts, made by the installer in windows/hooks.nsh) opens
// only the Science window (windows_app.rs).

/// The command-line switch that opens Science instead of ClassKernel.
pub const SCIENCE_ARG: &str = "--science";

/// Whether a command line asks for Science.
pub fn wants_science<S: AsRef<str>>(args: &[S]) -> bool {
    args.iter().any(|a| a.as_ref() == SCIENCE_ARG)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_science_switch_opens_science() {
        assert!(wants_science(&["C:\\Program Files\\ClassKernel\\ClassKernel.exe", "--science"]));
        assert!(wants_science(&["ClassKernel.exe", "--other", "--science"]));
    }

    #[test]
    fn anything_else_opens_classkernel() {
        assert!(!wants_science(&["C:\\Program Files\\ClassKernel\\ClassKernel.exe"]));
        assert!(!wants_science::<&str>(&[]));
        assert!(!wants_science(&["ClassKernel.exe", "--sciences"]));
        assert!(!wants_science(&["ClassKernel.exe", "science"]));
    }
}
