#!/bin/bash
# Secret scan (Phase 6D): working tree + full git history for key-shaped strings. Prints pattern + location, never a value.
# Usage: pnpm scan-secrets   (exit 1 when anything is found)
# Prints pattern name + commit/file only — never the matched value.
declare -A P=(
  [meta_llm_key]='LLM\|[0-9]{6,}\|[A-Za-z0-9_-]{16,}'
  [jwt_supabase_key]='eyJhbGciOi[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{20,}'
  [postgres_url_with_password]='postgres(ql)?://[^:@/ ]+:[^@/ ]{6,}@'
  [openai_style_sk]='sk-[A-Za-z0-9_-]{20,}'
  [baseten_key_assign]='BASETEN_API_KEY *= *["'"'"']?[A-Za-z0-9._-]{12,}'
  [model_key_assign]='MODEL_API_KEY *= *["'"'"']?[A-Za-z0-9|._-]{12,}'
  [service_role_assign]='SERVICE_ROLE_KEY *= *["'"'"']?[A-Za-z0-9._-]{12,}'
  [cron_secret_assign]='CRON_SECRET *= *["'"'"']?[A-Za-z0-9._-]{12,}'
  [private_key_block]='-----BEGIN [A-Z ]*PRIVATE KEY-----'
)
echo "== working tree (tracked files)"
for n in "${!P[@]}"; do git grep -lIE "${P[$n]}" -- . ':!pnpm-lock.yaml' 2>/dev/null | sed "s/^/  $n: /" | tee -a /dev/stderr | grep -q . && FOUND=1; done
echo "== full history (all branches)"
for n in "${!P[@]}"; do
  git log --all -p --format='@@COMMIT %h' -- . ':!pnpm-lock.yaml' 2>/dev/null | grep -E "^@@COMMIT|^\+.*(${P[$n]})" | grep -B1 "^+" | grep "^@@COMMIT" | sort -u | sed "s/^@@COMMIT/  $n: commit/" | tee -a /dev/stderr | grep -q . && FOUND=1
done
echo "== untracked but not ignored"
git ls-files --others --exclude-standard | head
echo "== .env files tracked?"; git ls-files | grep -E '(^|/)\.env' 
if [ -n "$FOUND" ]; then echo "scan: POSSIBLE SECRETS FOUND"; exit 1; fi
echo "scan: clean"
