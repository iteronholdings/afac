import LegalPage, { Section } from "@/components/LegalPage";
import { COMPANY } from "@/lib/company";

export default function Refund() {
  return (
    <LegalPage title="환불규정">
      <p className="text-muted-foreground">
        본 환불규정은 {COMPANY.name}(이하 "회사")가 제공하는 체험단·리뷰 마케팅 서비스(이하 "서비스")의
        이용요금 결제 및 환불에 관한 사항을 정함을 목적으로 합니다.
      </p>

      <Section title="제1조 (적용 범위)">
        <p>본 규정은 회사가 제공하는 서비스를 이용하는 회원(업체)의 예치금 충전 및 캠페인 결제에 적용됩니다.</p>
      </Section>

      <Section title="제2조 (예치금 충전 및 환불)">
        <p>① 회원은 서비스 이용을 위해 예치금을 사전에 충전할 수 있습니다.</p>
        <p>② 충전한 예치금 중 캠페인 등에 사용되지 않은 잔액은 환불을 신청할 수 있습니다.</p>
        <p>③ 미사용 예치금 환불 시, 충전·환불에 수반되는 <b className="text-foreground">계좌이체 수수료 및 결제대행(PG) 수수료 등 실비를 공제</b>한 후 환불합니다.</p>
        <p>④ 이벤트·프로모션 등으로 회사가 무상 지급한 적립금은 환불 대상에서 제외됩니다.</p>
      </Section>

      <Section title="제3조 (캠페인 결제의 취소 및 환불)">
        <p>① 회원이 캠페인을 신청·결제하면 결제금액은 보유 예치금에서 차감됩니다.</p>
        <p>② <b className="text-foreground">관리자 승인 및 캠페인 모집(진행)이 시작되기 전까지</b>는 캠페인을 취소할 수 있으며, 결제금액은 <b className="text-foreground">전액 예치금으로 복원(환불)</b>됩니다.</p>
        <p>③ 캠페인 모집(진행)이 시작된 이후에는 용역의 제공이 개시된 것으로 보아 환불이 제한됩니다. 다만, 회사의 귀책사유로 서비스가 제공되지 못한 부분에 대해서는 환불합니다.</p>
      </Section>

      <Section title="제4조 (환불 처리 기간 및 방법)">
        <p>① 환불은 환불 신청이 승인된 날로부터 <b className="text-foreground">영업일 기준 3일 이내</b>에 처리됨을 원칙으로 합니다.</p>
        <p>② 캠페인 취소에 따른 환불은 예치금으로 복원되며, 예치금 잔액의 환불은 회원이 등록한 환불 계좌로 입금합니다.</p>
        <p>③ 결제수단 및 금융기관의 사정에 따라 처리일이 일부 지연될 수 있습니다.</p>
      </Section>

      <Section title="제5조 (환불 신청 방법)">
        <p>환불은 서비스 내 <b className="text-foreground">1:1 문의</b> 또는 고객센터({COMPANY.email})를 통해 신청할 수 있으며, 본인 및 결제 확인 절차가 필요할 수 있습니다.</p>
      </Section>

      <Section title="제6조 (환불의 제한)">
        <p>다음 각 호의 경우 환불이 제한될 수 있습니다.</p>
        <p>1. 이미 모집·진행이 시작되어 용역이 제공된 캠페인</p>
        <p>2. 회원의 약관·정책 위반(어뷰징 등)으로 이용이 제한된 경우</p>
        <p>3. 회사가 무상으로 제공한 적립금</p>
      </Section>

      <Section title="제7조 (기타)">
        <p>본 규정에 명시되지 않은 사항은 관계 법령 및 회사의 이용약관에 따릅니다.</p>
        <p className="mt-3 text-foreground/80">
          상호: {COMPANY.name} · 대표자: {COMPANY.ceo} · 사업자등록번호: {COMPANY.bizNo}<br />
          {COMPANY.address}<br />
          고객센터: {COMPANY.email}{!COMPANY.tel.startsWith("[") && ` / ${COMPANY.tel}`}
        </p>
      </Section>
    </LegalPage>
  );
}
