use anyhow::{Context, Result, bail};
use std::{path::Path, process::Command};

fn terminal_command(path: &Path, terminal_app: &Path) -> Result<Command> {
    if !path.is_absolute() {
        bail!("The selected path must be absolute");
    }
    let metadata = path
        .metadata()
        .with_context(|| format!("Cannot access {}", path.display()))?;
    let directory = if metadata.is_dir() {
        path
    } else {
        path.parent()
            .context("The selected path has no parent directory")?
    };
    if !terminal_app.is_absolute()
        || terminal_app
            .extension()
            .is_none_or(|extension| extension != "app")
        || !terminal_app.is_dir()
    {
        bail!(
            "Terminal application must be an existing absolute .app path: {}",
            terminal_app.display()
        );
    }
    let mut command = Command::new("/usr/bin/open");
    command.arg("-a").arg(terminal_app).arg(directory);
    Ok(command)
}

// Tauri dispatches this blocking process call off the main thread.
#[tauri::command(async)]
pub fn open_in_terminal(path: String, terminal_app: String) -> Result<(), String> {
    let launch = || -> Result<()> {
        let output = terminal_command(Path::new(&path), Path::new(&terminal_app))?
            .output()
            .context("Could not launch terminal application")?;
        if !output.status.success() {
            bail!(
                "Could not open {} in {} ({}): {}",
                path,
                terminal_app,
                output.status,
                String::from_utf8_lossy(&output.stderr).trim()
            );
        }
        Ok(())
    };
    launch().map_err(|error| {
        tracing::error!(%path, %terminal_app, error = %error, "Failed to open terminal");
        format!("{error:#}")
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    struct Fixture(PathBuf);

    impl Fixture {
        fn new() -> Self {
            let id = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let root =
                std::env::temp_dir().join(format!("cardinal-terminal-{}-{id}", std::process::id()));
            fs::create_dir(&root).unwrap();
            Self(root)
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn opens_files_in_their_parent_and_directories_in_themselves_without_shell_parsing() {
        let fixture = Fixture::new();
        let app = fixture.0.join("Custom ' 日本語.app");
        let directory = fixture.0.join("space ' \" 日本語 $(echo nope)");
        fs::create_dir(&app).unwrap();
        fs::create_dir(&directory).unwrap();
        let file = directory.join("file.txt");
        fs::write(&file, b"fixture").unwrap();
        for selected in [&file, &directory] {
            let command = terminal_command(selected, &app).unwrap();
            assert_eq!(command.get_program(), "/usr/bin/open");
            let args: Vec<_> = command.get_args().collect();
            assert_eq!(
                args,
                [
                    std::ffi::OsStr::new("-a"),
                    app.as_os_str(),
                    directory.as_os_str()
                ]
            );
        }
        let command = terminal_command(Path::new("/"), &app).unwrap();
        assert_eq!(command.get_args().last().unwrap(), "/");
    }

    #[test]
    fn rejects_missing_targets_and_invalid_applications() {
        let fixture = Fixture::new();
        let app = fixture.0.join("Terminal.app");
        fs::create_dir(&app).unwrap();
        assert!(terminal_command(&fixture.0.join("missing"), &app).is_err());
        assert!(terminal_command(Path::new("relative"), &app).is_err());
        for invalid in [
            Path::new("relative.app"),
            fixture.0.as_path(),
            &fixture.0.join("Missing.app"),
        ] {
            assert!(terminal_command(&fixture.0, invalid).is_err());
        }
        let file_app = fixture.0.join("File.app");
        fs::write(&file_app, b"not an app directory").unwrap();
        assert!(terminal_command(&fixture.0, &file_app).is_err());
    }
}
