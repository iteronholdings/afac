/**
 * 회원가입 공용 '개인정보처리방침 동의' 체크박스 (필수).
 * 방침 링크는 새 탭으로 열어 작성 중인 폼이 날아가지 않게 한다.
 */
export default function PrivacyConsent({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-2xl border border-border/70 bg-secondary/30 px-4 py-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
      />
      <span className="text-sm leading-snug text-muted-foreground">
        <a
          href="/privacy"
          target="_blank"
          rel="noreferrer"
          onClick={e => e.stopPropagation()}
          className="font-semibold text-primary underline underline-offset-2 hover:opacity-80"
        >
          개인정보처리방침
        </a>
        에 동의합니다. <span className="font-semibold text-destructive">(필수)</span>
      </span>
    </label>
  );
}
