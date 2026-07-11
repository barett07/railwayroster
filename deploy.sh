#!/bin/bash
# 部署 Edge Functions + 自動驗證
# verify_jwt 設定已寫死在 supabase/config.toml,CLI 會自動套用
set -e
cd "$(dirname "$0")"
REF="pgvrnhzbxgwcqbzeanai"
BASE="https://$REF.supabase.co/functions/v1"

for fn in admin-write calendar; do
  supabase functions deploy "$fn" --project-ref "$REF"
done

echo ""
echo "===== 部署後驗證 ====="
FAIL=0

# calendar:免 JWT,無 id 參數時應回 function 自己的錯誤訊息(代表程式有執行)
RESP=$(curl -s "$BASE/calendar")
if echo "$RESP" | grep -qi "authorization header"; then
  echo "❌ calendar 被閘道擋下:verify_jwt 可能被重置成 true,訂閱會壞掉!"
  FAIL=1
else
  echo "✅ calendar 正常(免 JWT,function 有執行:$(echo "$RESP" | head -c 40))"
fi

# admin-write:必須被閘道要求 JWT
if curl -s -X POST "$BASE/admin-write" | grep -qi "authorization header"; then
  echo "✅ admin-write 正常(閘道要求 JWT)"
else
  echo "❌ admin-write 未要求 JWT,verify_jwt 可能被改成 false!"
  FAIL=1
fi

exit $FAIL
