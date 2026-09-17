use serde::Serialize;
use std::fmt;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub code: String,
    pub message: String,
}

pub type AppResult<T> = Result<T, AppError>;

impl AppError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        Self::new("IO_ERROR", err.to_string())
    }
}

impl From<git2::Error> for AppError {
    fn from(err: git2::Error) -> Self {
        Self::new("GIT_ERROR", err.message())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        Self::new("API_ERROR", err.to_string())
    }
}

impl From<reqwest::Error> for AppError {
    fn from(err: reqwest::Error) -> Self {
        if err.is_timeout() {
            Self::new("TIMEOUT", err.to_string())
        } else {
            Self::new("API_ERROR", err.to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_error_serializes_code_and_message() {
        let err = AppError::new("NOT_REPO", "not a git repository");
        let v = serde_json::to_value(&err).unwrap();
        assert_eq!(v["code"], "NOT_REPO");
        assert_eq!(v["message"], "not a git repository");
    }
}
