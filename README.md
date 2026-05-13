<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/753657f8-fb11-4c2e-b173-495eea4a1c04

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set `GEMINI_API_KEY` in `.env` (or `.env.local`) at the project root — see `.env.example`.
3. Run the app:
   `npm run dev`

## GitHub Pages

- Repository: [duyeon23-del/jlptsnack](https://github.com/duyeon23-del/jlptsnack) — live site: `https://duyeon23-del.github.io/jlptsnack/`
- **Settings → Pages → Build and deployment**: Source **GitHub Actions** (한 번만 선택).
- **Settings → Secrets and variables → Actions**: `GEMINI_API_KEY` 저장 (빌드 시 주입).
- `main` 브랜치에 push하면 `.github/workflows/deploy-pages.yml`이 자동 배포합니다.
