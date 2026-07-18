@echo off
REM ============================================================================
REM  new-client-repo.bat
REM
REM  Clones the DataLens master repo, strips its git history (so no other
REM  client's commits/data ever ride along), creates a brand-new GitHub repo
REM  named "data-lens-<client>", pushes a fresh initial commit into it, and
REM  prints the new repo's URL. Double-click to run, or run from a Command
REM  Prompt window.
REM
REM  REQUIREMENTS
REM    - Git for Windows, on PATH.
REM    - GitHub CLI ("gh"), on PATH, already logged in (run "gh auth login"
REM      once beforehand). This is the primary/recommended path below.
REM    - If you do NOT want to install/use "gh": set a GITHUB_TOKEN
REM      environment variable (a GitHub Personal Access Token with "repo"
REM      scope) BEFORE running this script, e.g. from a Command Prompt:
REM          set GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
REM          new-client-repo.bat
REM      The token is never written into this file or echoed to the screen;
REM      it is only read from the environment at runtime. See the FALLBACK
REM      block near the bottom.
REM
REM  EDIT THESE TWO LINES BEFORE FIRST USE:
REM ============================================================================
set "MASTER_REPO_URL=[MASTER_REPO_URL]"
set "GITHUB_USERNAME=[GITHUB_USERNAME]"

REM Repo visibility for the new client repo: true = private, false = public.
set "REPO_PRIVATE=true"

setlocal EnableDelayedExpansion

REM ---------------------------------------------------------------------------
REM 1. Ask for the client's name and turn it into a safe repo-name slug.
REM    GitHub repo names cannot contain spaces, so "Acme Corp" becomes
REM    "data-lens-acme-corp".
REM ---------------------------------------------------------------------------
:ASK_CLIENT
set "CLIENT_NAME="
set /p "CLIENT_NAME=Client name (e.g. Acme Corp): "
if "%CLIENT_NAME%"=="" (
    echo   Please enter a client name.
    goto ASK_CLIENT
)

REM --- slugify: lowercase, spaces -> hyphens, strip characters GitHub disallows.
set "SLUG=%CLIENT_NAME%"
call :ToLower SLUG

REM spaces -> hyphens
set "SLUG=!SLUG: =-!"

REM strip anything that isn't a-z, 0-9, hyphen, or underscore
set "CLEAN="
for /l %%i in (0,1,300) do (
    if "!SLUG:~%%i,1!" NEQ "" (
        set "CH=!SLUG:~%%i,1!"
        echo(!CH!| findstr /r "^[a-z0-9_-]$" >nul
        if not errorlevel 1 set "CLEAN=!CLEAN!!CH!"
    )
)
set "SLUG=%CLEAN%"

if "%SLUG%"=="" (
    echo   That name didn't leave any usable characters. Try again with letters/numbers.
    goto ASK_CLIENT
)

set "NEW_REPO_NAME=data-lens-%SLUG%"
echo.
echo   New repo will be:  %GITHUB_USERNAME%/%NEW_REPO_NAME%
echo.

REM ---------------------------------------------------------------------------
REM 2. Sanity-check tooling before doing anything destructive/network-facing.
REM ---------------------------------------------------------------------------
where git >nul 2>nul
if errorlevel 1 (
    echo ERROR: git was not found on PATH. Install Git for Windows first.
    goto FAIL_NO_CLEANUP
)

set "USE_GH=1"
where gh >nul 2>nul
if errorlevel 1 set "USE_GH=0"

if "%USE_GH%"=="1" (
    gh auth status >nul 2>nul
    if errorlevel 1 (
        echo   "gh" is installed but not logged in. Falling back to the
        echo   GITHUB_TOKEN method instead. ^(Or run "gh auth login" and re-run.^)
        set "USE_GH=0"
    )
)

if "%USE_GH%"=="0" (
    if "%GITHUB_TOKEN%"=="" (
        echo ERROR: Neither a logged-in "gh" CLI nor a GITHUB_TOKEN environment
        echo        variable is available. Set one of the two and re-run.
        goto FAIL_NO_CLEANUP
    )
)

REM ---------------------------------------------------------------------------
REM 3. Clone the master repo into a scratch temp folder.
REM ---------------------------------------------------------------------------
set "WORKDIR=%TEMP%\dl-clone-%RANDOM%%RANDOM%"
echo Cloning %MASTER_REPO_URL% ...
git clone "%MASTER_REPO_URL%" "%WORKDIR%"
if errorlevel 1 (
    echo ERROR: git clone failed.
    goto FAIL_NO_CLEANUP
)

cd /d "%WORKDIR%"
if errorlevel 1 (
    echo ERROR: could not enter cloned folder.
    goto FAIL_NO_CLEANUP
)

REM ---------------------------------------------------------------------------
REM 4. Strip the master repo's git history and start a clean one, so no
REM    other client's commits (or data that once lived in this repo) come
REM    along for the ride.
REM ---------------------------------------------------------------------------
echo Starting a fresh git history for this client...
rmdir /s /q ".git"
if errorlevel 1 (
    echo ERROR: could not remove old .git folder.
    goto FAIL_CLEANUP
)

git init >nul
if errorlevel 1 goto FAIL_CLEANUP
git branch -M main
if errorlevel 1 goto FAIL_CLEANUP
git add .
if errorlevel 1 goto FAIL_CLEANUP
git commit -m "Initial commit: DataLens for %CLIENT_NAME%" >nul
if errorlevel 1 (
    echo ERROR: initial commit failed.
    goto FAIL_CLEANUP
)

REM ---------------------------------------------------------------------------
REM 5. Create the new GitHub repository.
REM ---------------------------------------------------------------------------
set "VISIBILITY_FLAG=--private"
if /i "%REPO_PRIVATE%"=="false" set "VISIBILITY_FLAG=--public"

if "%USE_GH%"=="1" (
    echo Creating GitHub repo %GITHUB_USERNAME%/%NEW_REPO_NAME% via gh CLI...
    gh repo create "%GITHUB_USERNAME%/%NEW_REPO_NAME%" %VISIBILITY_FLAG%
    if errorlevel 1 (
        echo ERROR: "gh repo create" failed ^(the repo may already exist^).
        goto FAIL_CLEANUP
    )
) else (
    REM --- FALLBACK: create the repo via the GitHub REST API using curl and
    REM     GITHUB_TOKEN from the environment. No token is stored in this file.
    echo Creating GitHub repo %NEW_REPO_NAME% via the GitHub API...
    set "PRIVATE_JSON=true"
    if /i "%REPO_PRIVATE%"=="false" set "PRIVATE_JSON=false"
    set "PAYLOAD=%TEMP%\dl-repo-payload-%RANDOM%.json"
    > "%PAYLOAD%" echo {"name":"%NEW_REPO_NAME%","private":%PRIVATE_JSON%}
    curl -s -o nul -w "%%{http_code}" -X POST ^
         -H "Authorization: token %GITHUB_TOKEN%" ^
         -H "Accept: application/vnd.github+json" ^
         https://api.github.com/user/repos ^
         -d "@%PAYLOAD%" > "%TEMP%\dl-http-code.txt"
    set /p HTTP_CODE=<"%TEMP%\dl-http-code.txt"
    del /q "%PAYLOAD%" "%TEMP%\dl-http-code.txt" >nul 2>nul
    if not "%HTTP_CODE%"=="201" (
        echo ERROR: GitHub API returned HTTP %HTTP_CODE% ^(expected 201^).
        echo        Check GITHUB_TOKEN and that the repo name isn't taken.
        goto FAIL_CLEANUP
    )
)

REM ---------------------------------------------------------------------------
REM 6. Point the local clone at the new repo and push.
REM ---------------------------------------------------------------------------
if "%USE_GH%"=="1" (
    set "REMOTE_URL=https://github.com/%GITHUB_USERNAME%/%NEW_REPO_NAME%.git"
) else (
    REM Token-authenticated HTTPS remote, built only from the env var at
    REM runtime - never written to disk beyond this one push.
    set "REMOTE_URL=https://%GITHUB_TOKEN%@github.com/%GITHUB_USERNAME%/%NEW_REPO_NAME%.git"
)

git remote add origin "%REMOTE_URL%"
if errorlevel 1 goto FAIL_CLEANUP

echo Pushing initial commit...
git push -u origin main
if errorlevel 1 (
    echo ERROR: git push failed.
    goto FAIL_CLEANUP
)

REM Drop the token out of the stored remote URL so it doesn't linger on disk.
if "%USE_GH%"=="0" (
    git remote set-url origin "https://github.com/%GITHUB_USERNAME%/%NEW_REPO_NAME%.git"
)

REM ---------------------------------------------------------------------------
REM 7. Done - print the new repo's URL.
REM ---------------------------------------------------------------------------
echo.
echo ============================================================
echo  Done. New client repo:
echo    https://github.com/%GITHUB_USERNAME%/%NEW_REPO_NAME%
echo ============================================================
echo.

REM ---------------------------------------------------------------------------
REM 8. Clean up the temp clone folder.
REM ---------------------------------------------------------------------------
cd /d "%~dp0"
rmdir /s /q "%WORKDIR%" 2>nul
endlocal
pause
exit /b 0

:FAIL_CLEANUP
cd /d "%~dp0"
if exist "%WORKDIR%" rmdir /s /q "%WORKDIR%" 2>nul
:FAIL_NO_CLEANUP
echo.
echo Aborted - see error above.
endlocal
pause
exit /b 1

REM ---------------------------------------------------------------------------
REM Helper: lowercases the variable whose NAME is passed in (delayed expansion).
REM ---------------------------------------------------------------------------
:ToLower
for %%A in ("A=a" "B=b" "C=c" "D=d" "E=e" "F=f" "G=g" "H=h" "I=i" "J=j" "K=k" "L=l" "M=m" "N=n" "O=o" "P=p" "Q=q" "R=r" "S=s" "T=t" "U=u" "V=v" "W=w" "X=x" "Y=y" "Z=z") do (
    for /f "tokens=1,2 delims==" %%B in (%%A) do call set "%1=%%%1:%%B=%%C%%"
)
exit /b 0
