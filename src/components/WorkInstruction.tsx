import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, FileText, Printer } from 'lucide-react';
import {
  WI_CHAPTERS, WI_DEFINITIONS, WI_META, WI_PURPOSE, WI_RECORDS, WI_REFERENCES, WI_REVISIONS, WI_ROLES, WI_SCOPE, WiStep
} from '../content/workInstruction';
import { ThemeToggle } from './ThemeToggle';
import { markLabel, WiFigure, WiScreenshot } from './WiFigures';

const thaiDate = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });

function Steps({ steps }: { steps: WiStep[] }) {
  return (
    <ol className="wi-steps">
      {steps.map((step, index) => typeof step === 'string'
        ? <li key={index}>{step}</li>
        : <li key={index}>{step.text}<ul>{step.sub.map(item => <li key={item}>{item}</li>)}</ul></li>)}
    </ol>
  );
}

/** Work Instruction for the whole system, laid out as a printable A4 document. */
export default function WorkInstruction() {
  const navigate = useNavigate();
  const sections = [
    ['purpose', '1. วัตถุประสงค์'], ['scope', '2. ขอบเขต'], ['definitions', '3. คำนิยาม'], ['roles', '4. หน้าที่และความรับผิดชอบ'],
    ['procedures', '5. ขั้นตอนการปฏิบัติงาน'], ['records', '6. บันทึกที่เกี่ยวข้อง'], ['references', '7. เอกสารอ้างอิง'], ['revisions', '8. ประวัติการแก้ไขเอกสาร']
  ];

  return (
    <div className="wi-page min-h-screen">
      <header className="wi-toolbar print:hidden">
        <button type="button" onClick={() => navigate('/')} className="card-action">
          <ChevronLeft size={16} /> กลับสู่ระบบงาน
        </button>
        <div className="flex min-w-0 items-center gap-2">
          <FileText size={18} className="shrink-0" />
          <span className="truncate text-sm font-bold">{WI_META.number} · WI การใช้งานระบบ</span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button type="button" onClick={() => window.print()} className="btn-primary px-3 py-2 text-xs">
            <Printer size={14} /> พิมพ์ / บันทึก PDF
          </button>
        </div>
      </header>

      <main className="wi-doc">
        {/* Document control block */}
        <table className="wi-control">
          <tbody>
            <tr>
              <td rowSpan={3} className="wi-control-brand">FIBER SHARING<br />DATABASE</td>
              <td colSpan={2} className="wi-control-title">วิธีปฏิบัติงาน (Work Instruction)<br /><b>{WI_META.title}</b></td>
            </tr>
            <tr><td>เลขที่เอกสาร: <b>{WI_META.number}</b></td><td>ฉบับแก้ไขที่: <b>{WI_META.revision}</b></td></tr>
            <tr><td>วันที่มีผลบังคับใช้: <b>{thaiDate(WI_META.effectiveDate)}</b></td><td>หน่วยงาน: <b>{WI_META.department}</b></td></tr>
          </tbody>
        </table>

        <table className="wi-sign">
          <thead><tr><th>จัดทำโดย</th><th>ทบทวนโดย</th><th>อนุมัติโดย</th></tr></thead>
          <tbody>
            <tr>{[0, 1, 2].map(i => <td key={i}><div className="wi-sign-line" />(................................................)<br />ตำแหน่ง ........................................<br />วันที่ ......../......../........</td>)}</tr>
          </tbody>
        </table>

        <nav className="wi-toc" aria-label="สารบัญ">
          <h2>สารบัญ</h2>
          <ol>
            {sections.map(([id, title]) => (
              <li key={id}><a href={`#wi-${id}`}>{title}</a>
                {id === 'procedures' && <ol>{WI_CHAPTERS.map((chapter, c) =>
                  <li key={chapter.id}><a href={`#wi-${chapter.id}`}>5.{c + 1} {chapter.title}</a></li>)}</ol>}
              </li>
            ))}
          </ol>
        </nav>

        <section id="wi-purpose"><h2>1. วัตถุประสงค์</h2><ul>{WI_PURPOSE.map(item => <li key={item}>{item}</li>)}</ul></section>
        <section id="wi-scope"><h2>2. ขอบเขต</h2><ul>{WI_SCOPE.map(item => <li key={item}>{item}</li>)}</ul></section>
        <section id="wi-definitions">
          <h2>3. คำนิยาม</h2>
          <table className="wi-table"><thead><tr><th style={{ width: '28%' }}>คำศัพท์</th><th>ความหมาย</th></tr></thead>
            <tbody>{WI_DEFINITIONS.map(([term, meaning]) => <tr key={term}><td><b>{term}</b></td><td>{meaning}</td></tr>)}</tbody></table>
        </section>
        <section id="wi-roles">
          <h2>4. หน้าที่และความรับผิดชอบ</h2>
          <table className="wi-table"><thead><tr><th style={{ width: '28%' }}>บทบาท</th><th>หน้าที่</th></tr></thead>
            <tbody>{WI_ROLES.map(([role, duty]) => <tr key={role}><td><b>{role}</b></td><td>{duty}</td></tr>)}</tbody></table>
          <p className="wi-note">สิทธิ์การใช้งานจริงของแต่ละบทบาทกำหนดโดย Admin ในเมนู "สิทธิ์" และผู้ใช้จะเห็นเฉพาะโครงการของ Operator ที่ตนสังกัด</p>
        </section>

        <section id="wi-procedures">
          <h2>5. ขั้นตอนการปฏิบัติงาน</h2>
          {WI_CHAPTERS.map((chapter, c) => (
            <div key={chapter.id} id={`wi-${chapter.id}`} className="wi-chapter">
              <h3>5.{c + 1} {chapter.title}</h3>
              {chapter.procedures.map((procedure, p) => (
                <div key={procedure.id} className="wi-procedure">
                  <h4>5.{c + 1}.{p + 1} {procedure.title}</h4>
                  <p className="wi-who"><b>ผู้ปฏิบัติ:</b> {procedure.who}</p>
                  {procedure.detail.map(text => <p key={text} className="wi-detail">{text}</p>)}
                  {(procedure.figure || procedure.image) && (
                    <figure className="wi-figure">
                      {procedure.image ? <WiScreenshot src={procedure.image} alt={procedure.title} marks={procedure.marks ?? []} fallback={procedure.figure!} /> : <WiFigure id={procedure.figure!} />}
                      <figcaption>รูปที่ 5.{c + 1}.{p + 1} {procedure.title}</figcaption>
                    </figure>
                  )}
                  {procedure.callouts && <ul className="wi-legend">{procedure.callouts.map((text, i) =>
                    <li key={i}><span>{markLabel(i + 1)}</span><span>{text}</span></li>)}</ul>}
                  <p className="wi-detail"><b>ขั้นตอน</b></p>
                  <Steps steps={procedure.steps} />
                  {procedure.result && <div className="wi-result"><b>ผลลัพธ์ที่ได้:</b> {procedure.result}</div>}
                  {procedure.tips && <div className="wi-tips"><b>เคล็ดลับ</b><ul>{procedure.tips.map(tip => <li key={tip}>{tip}</li>)}</ul></div>}
                  {procedure.notes && <div className="wi-caution"><b>ข้อควรระวัง</b><ul>{procedure.notes.map(note => <li key={note}>{note}</li>)}</ul></div>}
                </div>
              ))}
            </div>
          ))}
        </section>

        <section id="wi-records">
          <h2>6. บันทึกที่เกี่ยวข้อง</h2>
          <table className="wi-table"><thead><tr><th>บันทึก</th><th style={{ width: '40%' }}>สถานที่จัดเก็บ</th></tr></thead>
            <tbody>{WI_RECORDS.map(([record, place]) => <tr key={record}><td>{record}</td><td>{place}</td></tr>)}</tbody></table>
        </section>
        <section id="wi-references"><h2>7. เอกสารอ้างอิง</h2><ul>{WI_REFERENCES.map(item => <li key={item}>{item}</li>)}</ul></section>
        <section id="wi-revisions">
          <h2>8. ประวัติการแก้ไขเอกสาร</h2>
          <table className="wi-table"><thead><tr><th style={{ width: '14%' }}>ฉบับที่</th><th style={{ width: '24%' }}>วันที่</th><th>รายละเอียดการแก้ไข</th></tr></thead>
            <tbody>{WI_REVISIONS.map(row => <tr key={row.revision}><td>{row.revision}</td><td>{thaiDate(row.date)}</td><td>{row.detail}</td></tr>)}</tbody></table>
        </section>

        <footer className="wi-footer">{WI_META.number} ฉบับแก้ไขที่ {WI_META.revision} · เอกสารควบคุม ห้ามทำสำเนาโดยไม่ได้รับอนุญาต</footer>
      </main>
    </div>
  );
}
