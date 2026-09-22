@echo off
title Push to GitHub - Excel School Stall
cls
echo ======================================================================
echo    EXCEL MATRICULATION HR. SEC. SCHOOL - GITHUB DEPLOYMENT
echo ======================================================================
echo.
echo Your local Git repository is already initialized and committed!
echo.
echo STEP 1: Create a repository on GitHub:
echo   1. Open: https://github.com/new
echo   2. Repository name: excel-school-stall
echo   3. Choose "Public"
echo   4. Click "Create repository" (do NOT check Add README)
echo.
echo STEP 2: Paste your GitHub repository URL below:
echo (Example: https://github.com/k29314592-jpg/excel-school-stall.git)
echo.
set /p REPO_URL="Enter your GitHub Repository URL: "

if "%REPO_URL%"=="" (
    echo.
    echo No URL entered. Defaulting to:
    echo https://github.com/k29314592-jpg/excel-school-stall.git
    set REPO_URL=https://github.com/k29314592-jpg/excel-school-stall.git
)

echo.
echo Linking repository to: %REPO_URL%
git remote remove origin 2>nul
git remote add origin %REPO_URL%
git branch -M main

echo.
echo Pushing code to GitHub...
git push -u origin main

if %ERRORLEVEL% equ 0 (
    echo.
    echo ======================================================================
    echo  SUCCESS! Your code has been uploaded to GitHub!
    echo ======================================================================
    echo.
    echo To turn on your FREE LIVE WEB LINK (GitHub Pages):
    echo   1. Go to your repository Settings on GitHub.
    echo   2. Click "Pages" on the left menu.
    echo   3. Under "Build and deployment" -^> "Branch", select "main" and "/ (root)".
    echo   4. Click "Save".
    echo.
    echo Your live website link will be:
    echo https://k29314592-jpg.github.io/excel-school-stall/
    echo ======================================================================
) else (
    echo.
    echo [NOTE] If you saw a login prompt, complete the browser login.
    echo If the repository does not exist yet, create it at https://github.com/new first!
)

echo.
pause
