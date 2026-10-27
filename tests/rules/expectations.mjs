// Declared outcomes, written from the approved plan BEFORE any run. [old rules, new rules].
// The category is derived: ALLOW/ALLOW = UNCHANGED-ALLOW, DENY/DENY = UNCHANGED-DENY, ALLOW/DENY = CLOSED-HOLE.
// A DENY -> ALLOW pair would be INTENTIONALLY-CHANGED, which must stay empty. Do not edit silently.
const UA = ['ALLOW', 'ALLOW'];
const UD = ['DENY', 'DENY'];
const CH = ['ALLOW', 'DENY'];
const rows = (pair, ids) => Object.fromEntries(ids.split(/\s+/).filter(Boolean).map(id => [id, pair]));

export const EXPECTED = {
  // sign: faithful flows
  ...rows(UA, 'G19 G18 L1 G1 G2 G3 G4 G4b G5 G6 G7 G7b G7c G8 G8b G9 G9a G9b G10 G11 G12 G13 G15 G16 G17'),
  ...rows(UD, 'G14'),
  ...rows(UA, 'LS1 LS1b LS1c LS3'), ...rows(CH, 'LS2 LS2b'),
  ...rows(UA, 'N1 N2 N3 N6'), ...rows(CH, 'N4 N5'),
  ...rows(UA, 'O1 O2 O3 O5 O7 RT2 RT3'), ...rows(CH, 'O4 O6 O8 RT1'),
  ...rows(UA, 'M1 M3 M5a M5b M5c M6 M8 M9 M10a M10b'), ...rows(CH, 'M2 M4 M5d M5e M5f M7 M10c M10d'),
  // sign: forgeries
  ...rows(CH, 'D24.ownerExpansion D24.nonCompletingOm D24.malformedAtOm D24.malformedOmRejection D25.pendingForged D25.completionBlocked D26.snapshotOtherProject D23.unreject D23.completeClaimOM D23.claimPlanning D1 D2 D3 D4 D4b D5 D5b D6 D7 D8 D8m D8c1 D8c2 D8c3 D8c4 D10.ownerSignOffs D10.gainKey D10.loseKey D11.om D11.symc D11.revoked D12 D13 D15b D17.reopen D17.rewrite'),
  ...rows(UD, 'D9.documentNumber D9.contractorName D9.designNotes D9.requestedBy D9.snapshotId D9.routeEnclosureSelections D9b D13b D13c D14 D15 D16 D17b'),
  // misc: submit / attach / backfill / final documents / forged new approvals / status
  ...rows(UA, 'DEL.creator DEL.ADM S2b.ADM S1 S1.ADM S2 S2.ADM S2.ADM-E S3 S4 S5.B1 S6.DSG S6.CRT-N S6.ADM S6b S6c.CRT-N S6c.ADM F1 F2 D22b'),
  ...rows(UD, 'DEL.PLN DEL.DSG-X GATE1 GATE2 GATE3 GATE4 S2b S5.B2 S5.B3 S5.B4 S5.B5 S5.B6 S5.B7 S5.B8 S5.B9 S5.B10 S5.B11 S5.B12 S5.B13 S5.B14 S5.B15 S6d D19b'),
  ...rows(CH, 'D18.approved D18.completed D18.entries D19 D19a D19c D20.emptyMaps D20.unsupportedOwner D20.mismatchedKeys D20.nonPending D20.badOwnerSignOffs D20.requestedByUid D20.finalApproved D20.finalDocuments D21.finalApprovedOutside D21.finalDocsEarly D21.finalDocsWrongUid D21.finalDocsOverwrite D22'),
  // create
  ...rows(UA, 'C1 C1b C5 C6 C7'), ...rows(UD, 'C1c C1d C1e'), ...rows(CH, 'C2 C3 C4 C4b C8'),
  // rewind
  ...rows(UA, 'WP10.completeThenRewind.Pending WP10.completeThenRewind.Rejected WP10a WP10b WP1 WP2 WP3 WP4 WP5 WP6 WP7 WP8 WP9a WP9b WP9c WX6'),
  ...rows(CH, 'WX7 WX8 WX7.om WX8.om WX1 WX2 WX3 WX4 WX5 WR1 WR2 WR3 WR4a WR4b WR4c WR5a WR5b WF1 WF2 WD1 WD2 WD3a WD3b WD4 W9'),
  ...rows(UD, 'WC1 WC2 WC3 WC4 WC5 W8.a W8.b W8.c W10.a W10.b'),
};
