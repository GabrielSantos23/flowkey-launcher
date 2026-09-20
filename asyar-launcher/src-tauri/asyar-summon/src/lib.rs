use std::ffi::OsStr;
use std::fmt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use windows::core::w;
use windows::Win32::Foundation::{HWND, LPARAM, WPARAM};
use windows::Win32::UI::WindowsAndMessaging::{
    FindWindowW, PostMessageW, SetForegroundWindow, ShowWindow, SW_RESTORE, SW_SHOW, WM_USER,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Flavor {
    Production,
    Development,
}

#[derive(Debug, PartialEq, Eq)]
pub enum SummonError {
    InvalidArguments,
    UnsupportedPlatform,
    ServiceUnavailable,
    CallFailed(String),
    LaunchFailed(String),
}

impl fmt::Display for SummonError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidArguments => write!(formatter, "usage: asyar-summon [--dev]"),
            Self::UnsupportedPlatform => {
                write!(
                    formatter,
                    "asyar-summon is running on an unsupported platform"
                )
            }
            Self::ServiceUnavailable => write!(formatter, "Asyar launcher service is unavailable"),
            Self::CallFailed(error) => write!(formatter, "launcher request failed: {error}"),
            Self::LaunchFailed(error) => write!(formatter, "failed to start Asyar: {error}"),
        }
    }
}

fn parse_args<I, S>(args: I) -> Result<Flavor, SummonError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let arguments = args.into_iter().collect::<Vec<_>>();
    match arguments.as_slice() {
        [] => Ok(Flavor::Production),
        [argument] if argument.as_ref() == OsStr::new("--dev") => Ok(Flavor::Development),
        _ => Err(SummonError::InvalidArguments),
    }
}

pub fn run<I, S>(args: I) -> Result<(), SummonError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    run_with(args, summon, cold_start)
}

fn run_with<I, S, Invoke, ColdStart>(
    args: I,
    invoke: Invoke,
    cold_start: ColdStart,
) -> Result<(), SummonError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
    Invoke: FnOnce(Flavor) -> Result<(), SummonError>,
    ColdStart: FnOnce() -> Result<(), SummonError>,
{
    let flavor = parse_args(args)?;
    match invoke(flavor) {
        Err(SummonError::ServiceUnavailable) => cold_start(),
        result => result,
    }
}

fn summon(_flavor: Flavor) -> Result<(), SummonError> {
    unsafe {
        let hwnd = FindWindowW(None, w!("asyar"));
        if hwnd == HWND(0) {
            return Err(SummonError::ServiceUnavailable);
        }
        let _ = ShowWindow(hwnd, SW_RESTORE);
        let _ = ShowWindow(hwnd, SW_SHOW);
        let _ = SetForegroundWindow(hwnd);
        let _ = PostMessageW(hwnd, WM_USER + 1, WPARAM(0), LPARAM(0));
        Ok(())
    }
}

#[derive(Debug, PartialEq, Eq)]
enum LaunchTarget {
    Sibling(PathBuf),
    Path,
}

fn cold_start() -> Result<(), SummonError> {
    let current_exe = std::env::current_exe().ok();
    let target = discover_launch_target(current_exe.as_deref());
    spawn_cold_start(&target)
}

fn discover_launch_target(current_exe: Option<&Path>) -> LaunchTarget {
    let sibling = current_exe
        .and_then(Path::parent)
        .map(|directory| directory.join("asyar.exe"));

    match (sibling, current_exe) {
        (Some(candidate), Some(helper)) if is_valid_sibling(&candidate, helper) => {
            LaunchTarget::Sibling(candidate)
        }
        _ => LaunchTarget::Path,
    }
}

fn is_valid_sibling(candidate: &Path, helper: &Path) -> bool {
    if !candidate.is_file() {
        return false;
    }
    !matches!(
        (dunce::canonicalize(candidate), dunce::canonicalize(helper)),
        (Ok(candidate), Ok(helper)) if candidate == helper
    )
}

fn cold_start_command(target: &LaunchTarget) -> Command {
    let mut command = match target {
        LaunchTarget::Sibling(path) => Command::new(path),
        LaunchTarget::Path => Command::new("asyar.exe"),
    };
    command
        .arg("--show-on-start")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    command
}

fn spawn_cold_start(target: &LaunchTarget) -> Result<(), SummonError> {
    cold_start_command(target)
        .spawn()
        .map(|_| ())
        .map_err(|error| {
            let target = match target {
                LaunchTarget::Sibling(path) => path.display().to_string(),
                LaunchTarget::Path => "asyar.exe from PATH".to_string(),
            };
            SummonError::LaunchFailed(format!("{target}: {error}"))
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;
    use std::ffi::OsString;

    #[test]
    fn no_arguments_selects_production() {
        assert_eq!(parse_args(Vec::<String>::new()), Ok(Flavor::Production));
    }

    #[test]
    fn dev_argument_selects_development() {
        assert_eq!(parse_args(["--dev"]), Ok(Flavor::Development));
    }

    #[test]
    fn unknown_argument_is_rejected() {
        assert_eq!(
            parse_args(["--unknown"]),
            Err(SummonError::InvalidArguments)
        );
    }

    #[test]
    fn multiple_arguments_are_rejected() {
        assert_eq!(
            parse_args(["--dev", "--unknown"]),
            Err(SummonError::InvalidArguments)
        );
    }

    #[test]
    fn duplicate_dev_arguments_are_rejected() {
        assert_eq!(
            parse_args(["--dev", "--dev"]),
            Err(SummonError::InvalidArguments)
        );
    }

    #[test]
    fn warm_success_does_not_attempt_cold_launch() {
        let launches = Cell::new(0);

        let result = run_with(
            Vec::<OsString>::new(),
            |_| Ok(()),
            || {
                launches.set(launches.get() + 1);
                Ok(())
            },
        );

        assert_eq!(result, Ok(()));
        assert_eq!(launches.get(), 0);
    }

    #[test]
    fn service_unavailable_attempts_cold_launch() {
        let launches = Cell::new(0);

        let result = run_with(
            Vec::<OsString>::new(),
            |_| Err(SummonError::ServiceUnavailable),
            || {
                launches.set(launches.get() + 1);
                Ok(())
            },
        );

        assert_eq!(result, Ok(()));
        assert_eq!(launches.get(), 1);
    }
}
