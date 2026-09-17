use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};

const API_BASE: &str = "https://gitee.com/api/v5";
const USER_AGENT: &str = "Note-Workstation/1.0";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GiteeUser {
    pub id: i64,
    pub login: String,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GiteeUserApi {
    pub id: i64,
    pub login: String,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GiteeRepo {
    pub id: i64,
    pub name: String,
    pub full_name: String,
    pub html_url: String,
    pub ssh_url: Option<String>,
    pub https_url: Option<String>,
    pub private: bool,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct GiteeRepoApi {
    id: i64,
    name: String,
    full_name: String,
    html_url: String,
    ssh_url: Option<String>,
    clone_url: Option<String>,
    private: bool,
    description: Option<String>,
}

fn client() -> AppResult<reqwest::Client> {
    Ok(reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .user_agent(USER_AGENT)
        .build()?)
}

fn map_http_error(status: reqwest::StatusCode, body: &str) -> AppError {
    if status.as_u16() == 401 || status.as_u16() == 403 {
        AppError::new("AUTH", format!("Gitee auth failed ({status}): {body}"))
    } else {
        AppError::new("API_ERROR", format!("Gitee API error ({status}): {body}"))
    }
}

#[tauri::command]
pub fn gitee_build_auth_url(https_url: String, token: String) -> AppResult<String> {
    let url = https_url.trim();
    let token = token.trim();
    if url.is_empty() || token.is_empty() {
        return Err(AppError::new(
            "INVALID_ARGUMENT",
            "https_url or token is empty",
        ));
    }

    // Strip existing userinfo if present
    let rest = if let Some(idx) = url.find("@gitee.com/") {
        format!("https://gitee.com/{}", &url[idx + "@gitee.com/".len()..])
    } else if let Some(idx) = url.find("@gitee.com") {
        // rare
        format!("https://gitee.com{}", &url[idx + "@gitee.com".len()..])
    } else {
        url.to_string()
    };

    let rest = rest
        .strip_prefix("https://")
        .or_else(|| rest.strip_prefix("http://"))
        .unwrap_or(&rest);

    Ok(format!("https://oauth2:{token}@{rest}"))
}

#[tauri::command]
pub async fn gitee_get_user(token: String) -> AppResult<GiteeUser> {
    let token = token.trim();
    if token.is_empty() {
        return Err(AppError::new("INVALID_ARGUMENT", "token is empty"));
    }
    let client = client()?;
    let resp = client
        .get(format!("{API_BASE}/user"))
        .query(&[("access_token", token)])
        .send()
        .await?;
    let status = resp.status();
    let body = resp.text().await?;
    if !status.is_success() {
        return Err(map_http_error(status, &body));
    }
    let u: GiteeUserApi = serde_json::from_str(&body)?;
    Ok(GiteeUser {
        id: u.id,
        login: u.login,
        name: u.name,
        avatar_url: u.avatar_url,
    })
}

#[tauri::command]
pub async fn gitee_list_repos(token: String) -> AppResult<Vec<GiteeRepo>> {
    let token = token.trim();
    if token.is_empty() {
        return Err(AppError::new("INVALID_ARGUMENT", "token is empty"));
    }
    let client = client()?;
    let resp = client
        .get(format!("{API_BASE}/user/repos"))
        .query(&[
            ("access_token", token),
            ("per_page", "100"),
            ("sort", "updated"),
            ("direction", "desc"),
        ])
        .send()
        .await?;
    let status = resp.status();
    let body = resp.text().await?;
    if !status.is_success() {
        return Err(map_http_error(status, &body));
    }
    let repos: Vec<GiteeRepoApi> = serde_json::from_str(&body)?;
    Ok(repos
        .into_iter()
        .map(|r| GiteeRepo {
            id: r.id,
            name: r.name,
            full_name: r.full_name,
            html_url: r.html_url,
            ssh_url: r.ssh_url,
            https_url: r.clone_url,
            private: r.private,
            description: r.description,
        })
        .collect())
}

#[derive(Serialize)]
struct CreateRepoBody<'a> {
    name: &'a str,
    private: bool,
    description: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    access_token: Option<&'a str>,
}

#[tauri::command]
pub async fn gitee_create_repo(
    token: String,
    name: String,
    private: bool,
    description: Option<String>,
) -> AppResult<GiteeRepo> {
    let token = token.trim().to_string();
    let name = name.trim().to_string();
    if token.is_empty() || name.is_empty() {
        return Err(AppError::new(
            "INVALID_ARGUMENT",
            "token or name is empty",
        ));
    }
    let desc = description.unwrap_or_default();
    let client = client()?;
    let resp = client
        .post(format!("{API_BASE}/user/repos"))
        .query(&[("access_token", token.as_str())])
        .json(&CreateRepoBody {
            name: &name,
            private,
            description: &desc,
            access_token: None,
        })
        .send()
        .await?;
    let status = resp.status();
    let body = resp.text().await?;
    if !status.is_success() {
        return Err(map_http_error(status, &body));
    }
    let r: GiteeRepoApi = serde_json::from_str(&body)?;
    Ok(GiteeRepo {
        id: r.id,
        name: r.name,
        full_name: r.full_name,
        html_url: r.html_url,
        ssh_url: r.ssh_url,
        https_url: r.clone_url,
        private: r.private,
        description: r.description,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_auth_url_basic() {
        let url = gitee_build_auth_url(
            "https://gitee.com/alice/notes.git".into(),
            "tok123".into(),
        )
        .unwrap();
        assert_eq!(url, "https://oauth2:tok123@gitee.com/alice/notes.git");
    }

    #[test]
    fn build_auth_url_refresh_existing() {
        let url = gitee_build_auth_url(
            "https://oauth2:old@gitee.com/alice/notes.git".into(),
            "newtok".into(),
        )
        .unwrap();
        assert_eq!(url, "https://oauth2:newtok@gitee.com/alice/notes.git");
    }

    #[test]
    fn build_auth_url_empty_rejected() {
        let err = gitee_build_auth_url("".into(), "t".into()).unwrap_err();
        assert_eq!(err.code, "INVALID_ARGUMENT");
    }
}
