"""묶음 F(pf): 카드별 테스트(test/mz_pf.js)에서 발견된 ext/규칙 데이터 보정. pre=True 로 공통 규칙의 잘못된 해석을 덮어쓴다."""

def load(reg):
    # 0248: 「ネクストヒントで手札から使用する場合」 — 넥스트 힌트로 사용할 때만 사건 색을 무시(일반 손패 사용은 색 일치 필요)
    reg('id_0248', 'ネクストヒントで手札から使用する場合', [{"ic": "ignorecolor", "cond": {"viaHint": True}, "lim": 0}], "B", pre=True)
