/**
 * 낚시배 예약 시스템 공통 스크립트
 */

// 1. 토큰 관련 함수 ---------------------------------------------------
/**
 * GitHub 토큰 모달 열기
 */
function openTokenModal() {
    const token = localStorage.getItem('github_token');
    if (token) {
        document.getElementById('githubToken').value = token;
    }
    document.getElementById('tokenModal').style.display = 'block';
}

/**
 * GitHub 토큰 모달 닫기
 */
function closeTokenModal() {
    document.getElementById('tokenModal').style.display = 'none';
}

/**
 * GitHub 토큰 저장
 */
function saveToken() {
    const token = document.getElementById('githubToken').value.trim();
    if (token) {
        localStorage.setItem('github_token', token);
        showPopupMessage('GitHub 토큰이 저장되었습니다', 'success');
        closeTokenModal();
        // 토큰 저장 후 CSV 다시 로드
        if (typeof loadCSV === 'function') {
            loadCSV();
        }
    } else {
        showPopupMessage('유효한 토큰을 입력해주세요', 'error');
    }
}

// 2. 팝업 메시지 관련 함수 ---------------------------------------------
/**
 * 팝업 메시지 표시
 * 
 * @param {string} message - 표시할 메시지
 * @param {string} type - 메시지 타입 (success, error, info, warning)
 */
function showPopupMessage(message, type) {
    const popupContainer = document.getElementById('popupContainer');
    const popup = document.createElement('div');
    popup.className = `popup-message ${type}`;
    popup.textContent = message;
    
    popupContainer.appendChild(popup);
    
    // 애니메이션 시작
    setTimeout(() => {
        popup.classList.add('show');
    }, 10);

    // 3초 후 메시지 제거
    setTimeout(() => {
        popup.style.opacity = '0';
        setTimeout(() => {
            if (popup.parentNode === popupContainer) {
                popupContainer.removeChild(popup);
            }
        }, 500);
    }, 3000);
}

// 하위 호환성을 위한 별칭
function showStatus(message, type) {
    showPopupMessage(message, type);
}

// 3. GitHub API 공통 함수 -----------------------------------------------
/**
 * GitHub 토큰 확인
 * 
 * @returns {string|null} GitHub 토큰 (없는 경우 null)
 */
function getGitHubToken() {
    const token = localStorage.getItem('github_token');
    if (!token) {
        showPopupMessage('GitHub 토큰이 필요합니다. 토큰을 설정해주세요.', 'warning');
        openTokenModal();
        return null;
    }
    return token;
}

/**
 * GitHub API 요청 공통 에러 처리
 * 
 * @param {Error} error - 발생한 에러
 * @param {string} context - 에러 컨텍스트 설명
 */
function handleGitHubError(error, context) {
    console.error(`${context} 오류:`, error);
    showPopupMessage(`${context} 중 오류가 발생했습니다: ${error.message}`, 'error');
    
    // 토큰 관련 오류인지 확인하고 토큰 모달 표시
    if (error.message.includes('토큰') || 
        error.message.includes('token') || 
        error.message.includes('인증') || 
        error.message.includes('auth') ||
        error.message.includes('401') ||
        error.message.includes('403')) {
        openTokenModal();
    }
}

/**
 * GitHub에서 파일 가져오기
 * 
 * @param {string} owner - GitHub 소유자
 * @param {string} repo - GitHub 저장소
 * @param {string} path - 파일 경로
 * @returns {Promise<Object>} 파일 데이터 객체 (content, sha 등 포함)
 */
async function fetchFileFromGitHub(owner, repo, path) {
    const token = getGitHubToken();
    if (!token) return null;
    
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    
    const response = await fetch(apiUrl, {
        headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json'
        }
    });
    
    if (!response.ok) {
        if (response.status === 401) {
            showPopupMessage('GitHub 토큰이 유효하지 않습니다. 토큰을 다시 설정해주세요.', 'error');
            openTokenModal();
            return null;
        }
        throw new Error(`GitHub API 오류: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
}

/**
 * GitHub에 파일 저장하기
 * 
 * @param {string} owner - GitHub 소유자
 * @param {string} repo - GitHub 저장소
 * @param {string} path - 파일 경로
 * @param {string} content - 저장할 내용 (UTF-8 텍스트)
 * @param {string} sha - 파일의 현재 SHA (이미 존재하는 파일 업데이트 시 필요)
 * @param {string} commitMessage - 커밋 메시지
 * @returns {Promise<Object>} 응답 객체
 */
async function saveFileToGitHub(owner, repo, path, content, sha, commitMessage = '파일 업데이트') {
    const token = getGitHubToken();
    if (!token) return null;
    
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    
    // 한글 인코딩을 위해 TextEncoder 사용
    const encoder = new TextEncoder();
    const contentBytes = encoder.encode(content);
    const base64Content = btoa(String.fromCharCode(...new Uint8Array(contentBytes)));
    
    const payload = {
        message: commitMessage,
        content: base64Content,
        committer: {
            name: 'CSV Editor',
            email: 'editor@example.com'
        }
    };
    
    // 기존 파일을 업데이트하는 경우 SHA 포함
    if (sha) {
        payload.sha = sha;
    }
    
    const response = await fetch(apiUrl, {
        method: 'PUT',
        headers: {
            'Authorization': `token ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/vnd.github.v3+json'
        },
        body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
        throw new Error(`파일 저장 오류: ${response.statusText}`);
    }
    
    return await response.json();
}

/**
 * GitHub 파일 내용 디코딩
 * 
 * @param {string} base64Content - Base64로 인코딩된 파일 내용
 * @returns {string} 디코딩된 UTF-8 텍스트
 */
function decodeGitHubContent(base64Content) {
    const contentBytes = Uint8Array.from(atob(base64Content), c => c.charCodeAt(0));
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(contentBytes);
}

// 4. 이벤트 리스너 ------------------------------------------------------
document.addEventListener('DOMContentLoaded', function() {
    // ESC 키를 눌렀을 때 모달 닫기
    window.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            if (document.getElementById('tokenModal').style.display === 'block') {
                closeTokenModal();
            }
        }
    });
    
    // 모달 외부 클릭 시 모달 닫기
    window.addEventListener('click', function(event) {
        const modal = document.getElementById('tokenModal');
        if (event.target === modal) {
            closeTokenModal();
        }
    });
});
