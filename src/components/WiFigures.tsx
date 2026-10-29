import React from 'react';

// Simplified drawings of the system's screens for the Work Instruction. Each
// numbered marker matches a callout in content/workInstruction.ts. They use
// fixed colours (classes wf-* in index.css) so they print the same in any theme.

const MARK = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'];
export const markLabel = (n: number) => MARK[n - 1] || String(n);

/** Wraps an element with a numbered marker on its top-left corner. */
function A({ n, children, className = '', style }: { n: number; children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return <span className={`wf-anchor ${className}`} style={style}><span className="wf-mark" aria-hidden="true">{n}</span>{children}</span>;
}
function Frame({ title, children, height }: { title: string; children: React.ReactNode; height?: number }) {
  return (
    <div className="wf-frame">
      <div className="wf-chrome"><i /><i /><i /><span>{title}</span></div>
      <div className="wf-body" style={height ? { minHeight: height } : undefined}>{children}</div>
    </div>
  );
}
const Btn = ({ children, kind = 'default' }: { children: React.ReactNode; kind?: 'default' | 'primary' | 'ghost' | 'danger' }) =>
  <span className={`wf-btn wf-btn-${kind}`}>{children}</span>;
const Field = ({ label, value, wide }: { label: string; value?: string; wide?: boolean }) => (
  <span className={`wf-field ${wide ? 'wf-wide' : ''}`}><small>{label}</small><span className="wf-input">{value || ' '}</span></span>
);
const Chip = ({ children, tone = 'sky' }: { children: React.ReactNode; tone?: 'sky' | 'amber' | 'green' | 'red' | 'pink' | 'slate' }) =>
  <span className={`wf-chip wf-chip-${tone}`}>{children}</span>;
const Row = ({ children, gap = 8, wrap, between, style }: { children: React.ReactNode; gap?: number; wrap?: boolean; between?: boolean; style?: React.CSSProperties }) =>
  <div className="wf-row" style={{ gap, flexWrap: wrap ? 'wrap' : undefined, justifyContent: between ? 'space-between' : undefined, ...style }}>{children}</div>;

function Login() {
  return (
    <Frame title="เข้าสู่ระบบ" height={250}>
      <div className="wf-login">
        <div className="wf-login-head">FIBER SHARING DATABASE</div>
        <div className="wf-login-body">
          <b>เข้าสู่ระบบ</b>
          <A n={1}><Field label="อีเมล" value="name@company.com" wide /></A>
          <Row between><small className="wf-muted">รหัสผ่าน</small><A n={3}><span className="wf-link">ลืมรหัสผ่าน?</span></A></Row>
          <A n={2}><span className="wf-input wf-wide">••••••••</span></A>
          <A n={4} className="wf-block"><Btn kind="primary">เข้าสู่ระบบ</Btn></A>
        </div>
      </div>
    </Frame>
  );
}

function Header({ marks = true }: { marks?: boolean }) {
  const nav = <Row gap={4}>{['ผู้ใช้งาน', 'ประวัติการใช้งาน', 'สิทธิ์', 'ตั้งค่า'].map(t => <Btn key={t} kind="ghost">{t}</Btn>)}<Btn>WI การใช้งาน</Btn></Row>;
  return (
    <div className="wf-header">
      <b>FIBER SHARING DATABASE</b>
      {marks ? <A n={1}>{nav}</A> : nav}
    </div>
  );
}

function ProjectCard({ marks = false }: { marks?: boolean }) {
  const footer = (
    <Row gap={6}>
      <Btn kind="ghost">แผนงาน <Chip tone="amber">38%</Chip></Btn><Btn kind="ghost">ไฟล์โครงการ</Btn><Btn kind="ghost">Export KMZ</Btn><Btn>เปิดแผนที่ ↗</Btn>
    </Row>
  );
  return (
    <div className="wf-card">
      <Row between><b>ถนนตัวอย่าง ช่วงที่ 1</b><span className="wf-muted">✎ 🗑</span></Row>
      <Row gap={10} style={{ marginTop: 6 }}><span className="wf-box">แบบร่าง (Draft) <Btn>เอกสารอนุมัติ</Btn></span><span className="wf-muted">Operator ที่มีสิทธิ์ (2):</span><Chip tone="amber">ITEL</Chip><Chip>UIH</Chip></Row>
      <div className="wf-sep" />
      <Row between><span className="wf-muted">● พร้อมใช้งาน</span>{marks ? <A n={6}>{footer}</A> : footer}</Row>
    </div>
  );
}

function Dashboard() {
  return (
    <Frame title="โครงการโครงข่าย" height={300}>
      <Header />
      <div className="wf-pad">
        <Row between><b className="wf-h">โครงการโครงข่าย</b><A n={4}><Btn kind="primary">+ สร้างโครงการ</Btn></A></Row>
        <Row between style={{ margin: '10px 0' }}>
          <A n={2}><span className="wf-input" style={{ width: 220 }}>ค้นหาชื่อโครงการ...</span></A>
          <A n={3}><Row gap={4}><Btn kind="primary">ทั้งหมด</Btn><Btn>ITEL</Btn><Btn>SYMC</Btn><Btn>UIH</Btn></Row></A>
        </Row>
        <A n={5} className="wf-block"><ProjectCard marks /></A>
      </div>
    </Frame>
  );
}

function CardActions() {
  return (
    <Frame title="การ์ดโครงการ" height={150}>
      <div className="wf-pad">
        <div className="wf-card">
          <Row between><b>ถนนตัวอย่าง ช่วงที่ 1</b><Row gap={10}><A n={5}><span className="wf-icon">✎</span></A><A n={6}><span className="wf-icon wf-red">🗑</span></A></Row></Row>
          <div className="wf-sep" />
          <Row between>
            <span className="wf-muted">● พร้อมใช้งาน</span>
            <Row gap={14}>
              <A n={1}><Btn kind="ghost">แผนงาน <Chip tone="green">72%</Chip></Btn></A>
              <A n={2}><Btn kind="ghost">ไฟล์โครงการ</Btn></A>
              <A n={3}><Btn kind="ghost">Export KMZ</Btn></A>
              <A n={4}><Btn>เปิดแผนที่ ↗</Btn></A>
            </Row>
          </Row>
        </div>
      </div>
    </Frame>
  );
}

function ProjectForm() {
  return (
    <Frame title="สร้างโครงการใหม่" height={250}>
      <div className="wf-modal">
        <b className="wf-h">สร้างโครงการใหม่</b>
        <div className="wf-muted">ตั้งชื่อโครงการและเลือก Operator ที่มีสิทธิ์</div>
        <A n={1} className="wf-block"><Field label="ชื่อโครงการ" value="ถนนพระราม 4 ช่วงที่ 1" wide /></A>
        <A n={2} className="wf-block"><Field label="รหัสเส้นทาง" value="BKK-R4-01" wide /></A>
        <A n={3}><Row gap={6}><Chip tone="amber">✓ ITEL</Chip><Chip tone="pink">SYMC</Chip><Chip>✓ UIH</Chip></Row></A>
        <Row between style={{ marginTop: 10 }}><Btn kind="ghost">ยกเลิก</Btn><A n={4}><Btn kind="primary">สร้างโครงการ</Btn></A></Row>
      </div>
    </Frame>
  );
}

function Profile() {
  return (
    <Frame title="Profile Settings" height={250}>
      <div className="wf-header"><b>FIBER SHARING DATABASE</b><Row gap={8}><A n={2}><span className="wf-icon">☀</span></A><A n={1}><span className="wf-box">ชื่อผู้ใช้ · DESIGN</span></A><A n={3}><span className="wf-icon">⎋</span></A></Row></div>
      <div className="wf-pad wf-grid2">
        <A n={4} className="wf-block"><div className="wf-card"><b>Personal Information</b><Field label="Display Name" value="ชื่อ นามสกุล" wide /><span className="wf-box">เลือกรูปจากอุปกรณ์ · ใช้รูปนี้</span></div></A>
        <A n={5} className="wf-block"><div className="wf-card"><b>Security &amp; Password</b><Field label="รหัสผ่านปัจจุบัน" value="••••••••" wide /><Field label="New Password" value="••••••••" wide /><Field label="Confirm New Password" value="••••••••" wide /></div></A>
      </div>
    </Frame>
  );
}

function MapCanvas({ children, popup, draft }: { children?: React.ReactNode; popup?: React.ReactNode; draft?: boolean }) {
  return (
    <div className="wf-map">
      <svg viewBox="0 0 400 220" preserveAspectRatio="none" aria-hidden="true">
        <path d="M20 180 L110 140 L190 150 L280 90 L380 60" stroke="#f97316" strokeWidth="4" fill="none" opacity=".85" />
        <path d="M190 150 L230 210" stroke="#10b981" strokeWidth="4" fill="none" opacity=".85" />
        {[[110, 140], [190, 150], [280, 90]].map(([x, y]) => <rect key={x} x={x - 6} y={y - 6} width="12" height="12" rx="2" fill="#16a34a" stroke="#fff" strokeWidth="2" />)}
        <circle cx="240" cy="118" r="7" fill="#fff" stroke="#f97316" strokeWidth="2" /><circle cx="240" cy="118" r="3.5" fill="none" stroke="#f97316" strokeWidth="1.5" />
        {draft && <>
          <path d="M60 60 L150 80 L230 50 L330 40" stroke="#f59e0b" strokeWidth="2" strokeDasharray="6 5" fill="none" />
          {[[60, 60], [150, 80], [230, 50], [330, 40]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="5" fill="#f59e0b" stroke="#fff" strokeWidth="2" />)}
        </>}
      </svg>
      {children}
      {popup}
    </div>
  );
}

function MapScreen() {
  return (
    <Frame title="แผนที่โครงการ" height={290}>
      <div className="wf-mapwrap">
        <div className="wf-side">
          <A n={1} className="wf-block"><div className="wf-box"><Btn>‹ Back to Projects</Btn><div><b>ถนนตัวอย่าง</b> <Chip tone="amber">รออนุมัติ</Chip></div></div></A>
          <A n={2} className="wf-block"><div className="wf-tools">{['Enclosure', 'Route', 'Loop', 'Select'].map(t => <span key={t}>{t}</span>)}</div></A>
          <A n={3} className="wf-block"><div className="wf-list"><div>ROUTES <Chip tone="slate">3</Chip></div><div>ENCLOSURES <Chip tone="slate">7</Chip></div><div>LOOPS <Chip tone="slate">1</Chip></div></div></A>
          <A n={6} className="wf-toggle"><span className="wf-icon">‹</span></A>
        </div>
        <MapCanvas popup={<A n={5} className="wf-popup"><div className="wf-card"><small className="wf-muted">FIBER OPTIC</small><b>BJ#01 - BJ#02</b><div className="wf-muted">216F · Tier 1 · 510 m</div></div></A>}>
          <A n={4} className="wf-layers"><span className="wf-box">☰ ชั้นแผนที่</span></A>
        </MapCanvas>
      </div>
    </Frame>
  );
}

function EnclosureForm() {
  return (
    <Frame title="เพิ่ม Enclosure" height={290}>
      <div className="wf-modal">
        <A n={1} className="wf-block"><Field label="Enclosure Name" value="BJ#01" wide /></A>
        <A n={2} className="wf-block"><Row gap={6}><Chip>● Snap to Fiber route</Chip><Chip tone="slate">○ Keep clicked location (no snap)</Chip></Row></A>
        <A n={3} className="wf-block"><Field label="Enclosure Type" value="Dome Closure 48F ▾" wide /></A>
        <A n={4} className="wf-block"><Row><Field label="Location Type" value="Pole ▾" /><Field label="Location Name" value="MH-123" /></Row></A>
        <A n={5} className="wf-block"><Row><Field label="Latitude" value="13.756300" /><Field label="Longitude" value="100.501800" /></Row></A>
        <Row between style={{ marginTop: 8 }}><Btn kind="ghost">Cancel</Btn><A n={6}><Btn kind="primary">บันทึก</Btn></A></Row>
      </div>
    </Frame>
  );
}

function RouteDraw() {
  return (
    <Frame title="วาดเส้น Fiber Optic" height={300}>
      <div className="wf-mapwrap">
        <div className="wf-side">
          <div className="wf-tools"><span>Enclosure</span><span className="wf-on">Route</span><span>Loop</span><span>Select</span></div>
          <div className="wf-box wf-info">Click on the map to draw the route.
            <A n={2} className="wf-block"><Row gap={4} wrap><Btn kind="primary">✓ Finish Drawing</Btn><Btn>✕ Cancel</Btn></Row></A>
          </div>
          <div className="wf-card wf-compact">
            <A n={3} className="wf-block"><Field label="Route Name" value="BJ#01 - BJ#02" wide /></A>
            <A n={4} className="wf-block"><Field label="Capacity / Fiber Type" value="216 Cores ▾" wide /></A>
            <A n={5} className="wf-block"><Field label="Tier" value="Tier 1 (ITEL, SYMC, UIH) ▾" wide /></A>
            <A n={6} className="wf-block"><Row><Field label="Mark Start" value="1200" /><Field label="Mark End" value="1710" /></Row></A>
          </div>
        </div>
        <MapCanvas draft>
          <A n={1} className="wf-points"><span /></A>
        </MapCanvas>
      </div>
    </Frame>
  );
}

function ContextMenu() {
  return (
    <Frame title="เมนูคลิกขวาบนเส้น Fiber" height={220}>
      <MapCanvas>
        <A n={1} className="wf-cursor"><span className="wf-icon">🖱</span></A>
        <div className="wf-menu">
          <A n={2} className="wf-block"><span>✂ CUT FIBER HERE</span></A>
          <A n={3} className="wf-block"><span>✂ SPLIT AT ENCLOSURE</span></A>
          <A n={4} className="wf-block"><span>✎ EDIT</span></A>
        </div>
      </MapCanvas>
    </Frame>
  );
}

const TUBE_COLORS = ['#2563eb', '#f97316', '#16a34a', '#92400e', '#64748b', '#f8fafc', '#dc2626', '#0f172a', '#eab308', '#7c3aed', '#ec4899', '#22d3ee'];

function CoreManager() {
  return (
    <Frame title="Core Manager" height={290}>
      <div className="wf-pad">
        <Row between wrap>
          <A n={1}><Row gap={4}><Btn>Filter by Owner ▾</Btn><Btn>Filter by Priority ▾</Btn></Row></A>
          <A n={2}><Btn>Enclosure span: BJ#01 → BJ#02 ▾</Btn></A>
        </Row>
        <div className="wf-grid2" style={{ marginTop: 10 }}>
          <div className="wf-card">
            <Row between><b>Tube 1 · 12 Cores</b><A n={3}><Btn>Owner: ITEL ▾</Btn></A></Row>
            <A n={4} className="wf-block"><div className="wf-cores">{TUBE_COLORS.map((c, i) => <span key={i} style={{ background: c }}>{i + 1}</span>)}</div></A>
            <Row between style={{ marginTop: 6 }}><b>Tube 2 · 12 Cores</b><Btn>Owner: UIH ▾</Btn></Row>
          </div>
          <A n={5} className="wf-block"><div className="wf-card"><b>Core 3</b><Row gap={4}><Chip tone="green">Used</Chip><Chip tone="slate">Reserved</Chip><Chip tone="red">Bad</Chip></Row><Field label="Label" value="CKT-0001" wide /><Field label="Usage Description" value="ลูกค้า ABC" wide /></div></A>
        </div>
        <Row between style={{ marginTop: 8 }}><Chip tone="amber">Unsaved Changes</Chip><A n={6}><Btn kind="primary">Confirm Changes?</Btn></A></Row>
      </div>
    </Frame>
  );
}

function Splice() {
  const cores = (side: string) => <div className="wf-cores wf-col">{TUBE_COLORS.slice(0, 6).map((c, i) => <span key={side + i} style={{ background: c }}>{i + 1}</span>)}</div>;
  return (
    <Frame title="Splice Manager · BJ#02" height={290}>
      <div className="wf-pad">
        <Row between>
          <A n={1}><Btn>ฝั่ง A: BJ#01 - BJ#02 ▾</Btn></A>
          <A n={6}><Row gap={4}><Btn>－</Btn><Btn>＋</Btn><Btn>⤢</Btn><Btn>Export Diagram as PDF</Btn></Row></A>
          <A n={2}><Btn>ฝั่ง B: BJ#02 - BJ#03 ▾</Btn></A>
        </Row>
        <div className="wf-splice">
          <A n={3}>{cores('a')}</A>
          <A n={4} className="wf-wires"><svg viewBox="0 0 200 150" aria-hidden="true">{[0, 1, 2, 3].map(i => <path key={i} d={`M0 ${12 + i * 25} C100 ${12 + i * 25}, 100 ${12 + i * 25}, 200 ${12 + i * 25}`} stroke={TUBE_COLORS[i]} strokeWidth="3" fill="none" />)}</svg></A>
          {cores('b')}
        </div>
        <Row gap={6} style={{ justifyContent: 'center' }}><A n={5}><Row gap={6}><Btn kind="primary">Splice</Btn><Btn kind="danger">Unsplice</Btn></Row></A></Row>
      </div>
    </Frame>
  );
}

function Files() {
  return (
    <Frame title="ไฟล์โครงการ" height={290}>
      <div className="wf-modal wf-modal-wide">
        <Row between><span className="wf-muted">1 โฟลเดอร์ · 2 ไฟล์</span><Row gap={6}><A n={1}><Btn>สร้างโฟลเดอร์</Btn></A><A n={2}><Btn kind="primary">กำลังอัปโหลด 64%</Btn></A></Row></Row>
        <A n={3} className="wf-block"><span className="wf-crumb">ไฟล์ทั้งหมด › <b>เอกสารปิดงาน</b></span></A>
        <A n={4} className="wf-block"><div className="wf-file">📁 <b>รูปหน้างาน</b></div></A>
        <A n={5} className="wf-block"><div className="wf-file">📄 <span><b>ผลทดสอบ OTDR.pdf</b><br /><small className="wf-muted">3.2 MB · แก้ไข 17 ต.ค. 2569</small></span>
          <A n={6} className="wf-right"><Row gap={4}><Btn>⤓</Btn><Btn>✎</Btn><Btn>⟳</Btn><Btn kind="danger">🗑</Btn></Row></A></div></A>
      </div>
    </Frame>
  );
}

function Schedule() {
  const rows: [string, number, number, number, string][] = [
    ['สำรวจเส้นทาง', 2, 14, 100, '#16a34a'], ['ออกแบบ', 14, 18, 100, '#16a34a'], ['ขออนุมัติแบบ 🔗', 32, 16, 33, '#dc2626'],
    ['เตรียมวัสดุ', 46, 16, 40, '#0284c7'], ['ลากสาย Fiber', 60, 24, 10, '#0284c7']
  ];
  return (
    <Frame title="แผนงานโครงการ" height={320}>
      <div className="wf-pad">
        <Row between><b className="wf-h">แผนงานโครงการ</b><A n={1}><Chip tone="amber">ล่าช้ากว่าแผน 8%</Chip></A></Row>
        <A n={2} className="wf-block"><div className="wf-progress"><span style={{ width: '38%' }} /><i style={{ left: '46%' }} /></div><small className="wf-muted">จริง 38% · ตามแผน 46%</small></A>
        <A n={3} className="wf-block"><Row gap={6}>{[['งานทั้งหมด', 7], ['เสร็จแล้ว', 2], ['กำลังทำ', 2], ['ล่าช้า', 1]].map(([l, v]) => <span key={l} className="wf-metric"><small>{l}</small><b>{v}</b></span>)}</Row></A>
        <A n={4} className="wf-block"><div className="wf-gantt">{rows.map(([name, l, w, p, c]) => (
          <div key={name}><span>{name}</span><span className="wf-track"><i style={{ left: `${l}%`, width: `${w}%` }} /><em style={{ left: `${l}%`, width: `${w * p / 100}%`, background: c }} /></span><b>{p}%</b></div>
        ))}<span className="wf-today" style={{ left: 'calc(120px + (100% - 160px) * 0.52)' }} /></div></A>
        <div className="wf-card wf-compact">
          <A n={5} className="wf-block"><Row><Field label="ผู้รับผิดชอบ" value="ผู้รับเหมา" /><Field label="เริ่ม" value="20/10/2569" /><Field label="สิ้นสุด" value="02/11/2569" /></Row></A>
          <A n={6} className="wf-block"><Row><small>ความคืบหน้า</small><span className="wf-slider"><span style={{ width: '40%' }} /></span><b>40%</b><span className="wf-input" style={{ flex: 1 }}>บันทึกความคืบหน้า…</span><Btn kind="primary">บันทึก</Btn></Row></A>
        </div>
      </div>
    </Frame>
  );
}

function ApprovalRequest() {
  return (
    <Frame title="เอกสารอนุมัติแบบ" height={300}>
      <div className="wf-grid2 wf-pad">
        <div className="wf-card wf-compact">
          <b>ยื่นคำขออนุมัติแบบโครงการใหม่ (2-Level Approval)</b>
          <A n={1} className="wf-block"><Field label="ชื่อบริษัทผู้รับจ้าง / ผู้ควบคุมงาน / เบอร์โทร / PO" value="บริษัท ตัวอย่าง จำกัด" wide /></A>
          <A n={2} className="wf-block"><Row><Field label="กำหนดการติดตั้ง" value="01/11/2569" /><Field label="ระยะทาง (กม.)" value="0.51" /></Row></A>
          <A n={3} className="wf-block"><Field label="บันทึกประกอบการยื่นขออนุมัติ" value="…" wide /></A>
          <A n={5} className="wf-block"><Btn kind="primary">ส่งคำขออนุมัติแบบ (เริ่มระดับที่ 1: Planning)</Btn></A>
        </div>
        <A n={4} className="wf-block"><div className="wf-card wf-slide"><b>FIBER INFRA SHARING</b><small className="wf-muted">ข้อเสนอการร่วมใช้โครงข่าย</small><Row gap={4}><span className="wf-metric"><small>Tier</small><b>3</b></span><span className="wf-metric"><small>ระยะทาง</small><b>0.51</b></span></Row>
          <Row gap={4} style={{ marginTop: 6 }}>{[1, 2, 3, 4, 5, 6].map(n => <Btn key={n} kind={n === 1 ? 'primary' : 'default'}>{n}</Btn>)}<Btn kind="primary">ถัดไป ›</Btn></Row></div></A>
      </div>
    </Frame>
  );
}

function ApprovalSign() {
  return (
    <Frame title="ลงนามอนุมัติ" height={280}>
      <div className="wf-modal">
        <Row between><b>ลายเซ็นอิเล็กทรอนิกส์</b><A n={1}><Chip tone="amber">รอลงนามระดับ Planning</Chip></A></Row>
        <A n={2} className="wf-block"><Field label="ชื่อ-นามสกุล ผู้ลงนาม" value="นาย ตัวอย่าง ใจดี" wide /></A>
        <A n={3} className="wf-block"><Field label="ตำแหน่ง" value="ผู้จัดการฝ่าย Planning" wide /></A>
        <A n={4} className="wf-block"><div className="wf-sigpad"><svg viewBox="0 0 200 50" aria-hidden="true"><path d="M10 35 C30 5, 45 45, 60 25 S90 10, 100 30 S140 40, 190 15" stroke="#0f172a" strokeWidth="2" fill="none" /></svg></div></A>
        <Row between><A n={6}><Btn kind="danger">✕ ไม่อนุมัติ / ขอแก้ไข</Btn></A><A n={5}><Btn kind="primary">✓ ลงนามอนุมัติ</Btn></A></Row>
      </div>
    </Frame>
  );
}

function Users() {
  return (
    <Frame title="User Access Management" height={260}>
      <div className="wf-pad">
        <Row gap={6} wrap>
          <A n={1}><Row gap={4}><span className="wf-input" style={{ width: 150 }}>name@company.com</span><span className="wf-input" style={{ width: 120 }}>Password (Optional)</span></Row></A>
          <A n={2}><Btn>Design ▾</Btn></A><A n={3}><Btn>ITEL ▾</Btn></A><A n={4}><Btn kind="primary">+ เพิ่ม</Btn></A>
        </Row>
        <table className="wf-table"><thead><tr><th>User Information</th><th>Approval</th><th>Role</th><th>Operator</th><th>Actions</th></tr></thead>
          <tbody>
            <tr><td>user1@company.com</td><td><A n={5}><Chip tone="green">Approved</Chip></A></td><td>Design</td><td>ITEL</td><td><A n={6}><span>✎ 🗑</span></A></td></tr>
            <tr><td>user2@company.com</td><td><Chip tone="amber">Pending</Chip></td><td>Viewer</td><td>UIH</td><td>✎ 🗑</td></tr>
          </tbody></table>
      </div>
    </Frame>
  );
}

function Permissions() {
  const roles = ['Admin', 'Management', 'Planning', 'Design', 'Viewer', 'Sub-contract'];
  return (
    <Frame title="Role Permissions Matrix" height={240}>
      <div className="wf-pad">
        <table className="wf-table"><thead><tr><th><A n={1}><span>Feature Category</span></A></th>{roles.map((r, i) => <th key={r}>{i === 0 ? <A n={2}><span>{r}</span></A> : r}</th>)}</tr></thead>
          <tbody>{['สร้างโครงการ', 'แก้ไขแผนที่', 'จัดการ Splice', 'ลงนามอนุมัติ'].map((f, row) => (
            <tr key={f}><td>{f}</td>{roles.map((r, i) => {
              const on = i === 0 || (i === 3 && row < 3) || ((i === 1 || i === 2) && row === 3);
              const cell = <span className="wf-check">{on ? '✓' : '·'}</span>;
              return <td key={r}>{row === 0 && i === 3 ? <A n={3}>{cell}</A> : cell}</td>;
            })}</tr>
          ))}</tbody></table>
        <Row style={{ justifyContent: 'flex-end', marginTop: 8 }}><A n={4}><Btn kind="primary">บันทึก</Btn></A></Row>
      </div>
    </Frame>
  );
}

function Settings() {
  return (
    <Frame title="ตั้งค่าระบบ" height={270}>
      <div className="wf-pad">
        <A n={1} className="wf-block"><Row gap={4}><Btn kind="primary">Enclosure Types</Btn><Btn>Fiber Specs</Btn><Btn>Fiber Color Management</Btn><Btn>Owner Logos</Btn></Row></A>
        <div className="wf-grid2" style={{ marginTop: 10 }}>
          <A n={2} className="wf-block"><div className="wf-card wf-compact">{['Dome Closure 48F', 'Inline Closure 96F', 'ODF 144F'].map(t => <Row key={t} between><span>■ {t}</span><span className="wf-muted">✎ 🗑</span></Row>)}</div></A>
          <div className="wf-card wf-compact">
            <A n={3} className="wf-block"><Row><Field label="Specification Name" value="Dome Closure 48F" /><Field label="Capacity" value="48" /><Field label="Splice Trays" value="4" /></Row></A>
            <A n={4} className="wf-block"><Row><span className="wf-upload">Map Icon Symbol</span><span className="wf-upload">รูปภาพประกอบรายงาน (Ctrl+V)</span></Row></A>
            <Row style={{ justifyContent: 'flex-end' }}><A n={5}><Btn kind="primary">บันทึก</Btn></A></Row>
          </div>
        </div>
      </div>
    </Frame>
  );
}

function Logs() {
  return (
    <Frame title="System Activity Logs" height={200}>
      <div className="wf-pad">
        <table className="wf-table"><thead><tr><th><A n={1}><span>Timestamp</span></A></th><th><A n={2}><span>User</span></A></th><th><A n={3}><span>Action</span></A></th><th><A n={4}><span>Description</span></A></th></tr></thead>
          <tbody>
            <tr><td>17/10/2569 13:18</td><td>user1@company.com</td><td>login</td><td>User logged in</td></tr>
            <tr><td>17/10/2569 13:05</td><td>admin@company.com</td><td>update_permissions</td><td>Updated role permissions</td></tr>
          </tbody></table>
      </div>
    </Frame>
  );
}

const FIGURES: Record<string, () => React.ReactElement> = {
  login: Login, dashboard: Dashboard, 'card-actions': CardActions, 'project-form': ProjectForm, profile: Profile,
  map: MapScreen, 'enclosure-form': EnclosureForm, 'route-draw': RouteDraw, 'context-menu': ContextMenu,
  'core-manager': CoreManager, splice: Splice, files: Files, schedule: Schedule,
  'approval-request': ApprovalRequest, 'approval-sign': ApprovalSign, users: Users, permissions: Permissions, settings: Settings, logs: Logs
};

export function wiFigureView({ image, failed }: { image?: string; failed: boolean }): 'drawing' | 'image' {
  return image && !failed ? 'image' : 'drawing';
}

export function WiScreenshot({ src, alt, marks, fallback }: { src: string; alt: string; marks: { x: number; y: number }[]; fallback: string }) {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [src]);
  if (wiFigureView({ image: src, failed }) === 'drawing') return <WiFigure id={fallback} />;
  return <div className="wi-shot">
    <img src={src} alt={alt} onError={() => setFailed(true)} />
    {marks.map((mark, index) => <span key={index} className="wi-shot-mark" aria-hidden="true" style={{ left: `${mark.x}%`, top: `${mark.y}%` }}>{markLabel(index + 1)}</span>)}
  </div>;
}

export function WiFigure({ id }: { id: string }) {
  const Figure = FIGURES[id];
  return Figure ? <Figure /> : null;
}
