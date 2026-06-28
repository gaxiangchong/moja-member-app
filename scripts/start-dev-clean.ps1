# Clears a stale Windows/shell DATABASE_URL so Prisma uses .env (localhost:5433).
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
Set-Location (Join-Path $PSScriptRoot '..')
npm run start:dev
