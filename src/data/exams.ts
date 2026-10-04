import type { Exam, Source } from './types'

/**
 * Every portal rule SahiSize knows. Numbers only; the words are in src/i18n/en.ts.
 *
 * Rules change with each notification, and third-party sites often disagree (several of the
 * numbers widely quoted online were wrong when checked). A preset gets a `source` only after its
 * numbers were read in the official notice on `verifiedOn`; `partial` marks a rule that could only
 * be partly confirmed. `npm run presets:check` validates this file and warns when a check is old.
 */
const CHECKED = '2026-10-04'

const IBPS: Source = {
  title: 'IBPS CRP PO/MT-XV notification (vacancies 2026-27), guidelines for scanning and upload of documents',
  url: 'https://www.ibps.in/wp-content/uploads/Detailed-Notification_CRP-PO-XV.pdf',
  verifiedOn: CHECKED,
}
const SBI: Source = {
  title: 'SBI Probationary Officers 2026, detailed advertisement CRPD/PO/2026-27/09',
  url: 'https://sbi.bank.in/csfile/18062026_1_Detailed_Adv.2026.pdf',
  verifiedOn: CHECKED,
}
const SSC: Source = {
  title: 'SSC Combined Higher Secondary (10+2) Level Examination 2026 notice (7 Sep 2026), para 9.6',
  url: 'https://ssc.gov.in/api/attachment/uploads/masterData/NoticeBoards/Notice_of_adv_chsl_2026.pdf',
  verifiedOn: CHECKED,
}
const UPSC_NOTICE = 'https://www.upsc.gov.in/sites/default/files/Notif-CSP-2026-Engl-060226Rev.pdf'
const RRB: Source = {
  title: 'RRB Centralised Employment Notice CEN 01/2026 (Assistant Loco Pilot), para 13.4–13.5',
  url: 'https://rrbajmer.gov.in/Upload_PDF/CEN%2001-2026%20Eng-639143539720035538.pdf',
  verifiedOn: CHECKED,
}
const NEET: Source = {
  title: 'NTA NEET (UG) 2026 Information Bulletin, step 2(d)',
  url: 'https://cdnbbsr.s3waas.gov.in/s37bc1ec1d9c3426357e69acd5bf320061/uploads/2026/02/202602231394640855.pdf',
  verifiedOn: CHECKED,
}
const JEE: Source = {
  title: 'NTA JEE (Main) 2026 Information Bulletin, application form step 2',
  url: 'https://cdnbbsr.s3waas.gov.in/s3f8e59f4b2fe7c5705bf878bbd494ccdf/uploads/2025/10/202510311145384616.pdf',
  verifiedOn: CHECKED,
}
const CUET: Source = {
  title: 'NTA CUET (UG) 2026 Information Bulletin',
  url: 'https://cdnbbsr.s3waas.gov.in/s3d1a21da7bca4abff8b0b61b87597de73/uploads/2026/01/202601031633478370.pdf',
  verifiedOn: CHECKED,
}
const PAN: Source = {
  title: 'Protean (NSDL) online PAN application with DSC: scanned document specifications',
  url: 'https://tin.tin.proteantech.in/pan/InstructionDSC.html',
  verifiedOn: CHECKED,
}

export const EXAMS: Exam[] = [
  {
    id: 'ibps',
    slug: 'ibps-photo-signature-size',
    name: 'IBPS',
    category: 'banking',
    related: ['sbi', 'ssc', 'rrb'],
    presets: [
      { id: 'ibps-photo', doc: 'photo', format: 'jpeg', kb: { min: 20, max: 50 }, px: { w: 200, h: 230 }, approx: true, source: IBPS },
      { id: 'ibps-signature', doc: 'signature', format: 'jpeg', kb: { min: 10, max: 20 }, px: { w: 140, h: 60 }, approx: true, source: IBPS },
      { id: 'ibps-thumb', doc: 'thumb', format: 'jpeg', kb: { min: 20, max: 50 }, px: { w: 240, h: 240 }, dpi: 200, approx: true, source: IBPS },
      { id: 'ibps-declaration', doc: 'declaration', format: 'jpeg', kb: { min: 50, max: 100 }, px: { w: 800, h: 400 }, dpi: 200, approx: true, source: IBPS },
      { id: 'ibps-certificate', doc: 'document', format: 'pdf', kb: { max: 500 }, source: { ...IBPS, note: '10th certificate, A4 pages.' } },
    ],
  },
  {
    id: 'sbi',
    slug: 'sbi-photo-signature-size',
    name: 'SBI',
    category: 'banking',
    related: ['ibps', 'ssc', 'upsc'],
    presets: [
      { id: 'sbi-photo', doc: 'photo', format: 'jpeg', kb: { min: 20, max: 50 }, px: { w: 200, h: 230 }, approx: true, source: SBI },
      { id: 'sbi-signature', doc: 'signature', format: 'jpeg', kb: { min: 10, max: 20 }, px: { w: 140, h: 60 }, approx: true, source: SBI },
      { id: 'sbi-thumb', doc: 'thumb', format: 'jpeg', kb: { min: 20, max: 50 }, px: { w: 240, h: 240 }, dpi: 200, approx: true, source: SBI },
      { id: 'sbi-declaration', doc: 'declaration', format: 'jpeg', kb: { min: 50, max: 100 }, px: { w: 800, h: 400 }, dpi: 200, approx: true, source: SBI },
    ],
  },
  {
    id: 'ssc',
    slug: 'ssc-photo-signature-size',
    name: 'SSC',
    category: 'ssc',
    related: ['rrb', 'ibps', 'upsc'],
    presets: [
      { id: 'ssc-photo', doc: 'photo', format: 'jpeg', kb: { min: 20, max: 50 }, live: true, source: SSC },
      {
        id: 'ssc-signature',
        doc: 'signature',
        format: 'jpeg',
        kb: { min: 10, max: 20 },
        px: { cm: [6, 2], dpi: 100 },
        approx: true,
        source: { ...SSC, note: 'Para 9.6 says about 6.0 × 2.0 cm; the notice’s annexure says about 4.0 × 2.0 cm. Both say “about”; the KB limit is what is checked.' },
      },
    ],
  },
  {
    id: 'upsc',
    slug: 'upsc-photo-signature-size',
    name: 'UPSC',
    category: 'upsc',
    related: ['ssc', 'sbi', 'ibps'],
    presets: [
      {
        id: 'upsc-photo',
        doc: 'photo',
        format: 'jpeg',
        kb: { min: 20, max: 200 },
        px: { w: 550, h: 550 },
        accept: { minW: 350, maxW: 1000, minH: 350, maxH: 1000 },
        approx: true,
        filename: 'photo',
        source: {
          title: 'UPSC Civil Services Examination 2026 notice No. 05/2026-CSE (photo upload plus live photo)',
          url: UPSC_NOTICE,
          verifiedOn: CHECKED,
          partial: true,
          note: 'The notice confirms the upload and the live photo; the KB and pixel limits are on the upsconline instructions page, which could not be opened to check.',
        },
      },
      {
        id: 'upsc-signature',
        doc: 'signature',
        format: 'jpeg',
        kb: { min: 20, max: 100 },
        px: { w: 500, h: 500 },
        accept: { minW: 350, maxW: 500, minH: 350, maxH: 500 },
        approx: true,
        multi: 3,
        filename: 'signature',
        source: {
          title: 'UPSC Civil Services Examination 2026 notice No. 05/2026-CSE, note 3 (three signatures)',
          url: UPSC_NOTICE,
          verifiedOn: CHECKED,
          partial: true,
          note: 'The notice confirms three signatures in black ink; the KB and pixel limits are on the upsconline instructions page, which could not be opened to check.',
        },
      },
    ],
  },
  {
    id: 'rrb',
    slug: 'rrb-photo-signature-size',
    name: 'RRB',
    category: 'railways',
    related: ['ssc', 'ibps', 'neet'],
    presets: [
      { id: 'rrb-photo', doc: 'photo', format: 'jpeg', kb: { min: 20, max: 50 }, live: true, source: RRB },
      {
        id: 'rrb-signature',
        doc: 'signature',
        format: 'jpeg',
        kb: { min: 30, max: 49 },
        px: { cm: [3.5, 2], dpi: 200 },
        accept: { minW: 140, minH: 60 },
        approx: true,
        source: { ...RRB, note: 'At least 140 × 60 pixels, signed in black ink, centred in a 35 × 20 mm box.' },
      },
      { id: 'rrb-certificate', doc: 'document', format: 'pdf', kb: { max: 400 }, source: { ...RRB, note: 'SC/ST certificate for the free travel pass, “less than 400 KB”.' } },
    ],
  },
  {
    id: 'neet',
    slug: 'neet-photo-signature-size',
    name: 'NEET UG',
    category: 'entrance',
    related: ['jee-main', 'cuet', 'upsc'],
    presets: [
      { id: 'neet-photo', doc: 'photo', format: 'jpeg', kb: { min: 10, max: 200 }, px: { cm: [3.5, 4.5], dpi: 200 }, approx: true, source: NEET },
      { id: 'neet-signature', doc: 'signature', format: 'jpeg', kb: { min: 10, max: 100 }, px: { cm: [5, 2], dpi: 200 }, approx: true, source: NEET },
      {
        id: 'neet-thumb',
        doc: 'thumb',
        format: 'jpeg',
        kb: { min: 50, max: 200 },
        source: { ...NEET, note: 'The bulletin gives both 10–200 KB and 50–300 KB for the finger and thumb impressions; 50–200 KB passes both.' },
      },
      { id: 'neet-certificate', doc: 'document', format: 'pdf', kb: { min: 50, max: 300 }, source: { ...NEET, note: 'Class 10 certificate, marksheet, category and address proofs: each 50–300 KB.' } },
    ],
  },
  {
    id: 'jee-main',
    slug: 'jee-main-photo-signature-size',
    name: 'JEE Main',
    category: 'entrance',
    related: ['neet', 'cuet', 'upsc'],
    presets: [
      { id: 'jee-main-photo', doc: 'photo', format: 'jpeg', kb: { min: 10, max: 200 }, px: { cm: [3.5, 4.5], dpi: 200 }, approx: true, source: JEE },
      { id: 'jee-main-signature', doc: 'signature', format: 'jpeg', kb: { min: 10, max: 100 }, px: { cm: [5, 2], dpi: 200 }, approx: true, source: JEE },
      { id: 'jee-main-certificate', doc: 'document', format: 'pdf', kb: { min: 50, max: 300 }, source: { ...JEE, note: 'Class 10 certificate or marksheet; the disability certificate has the same limit.' } },
    ],
  },
  {
    id: 'cuet',
    slug: 'cuet-photo-signature-size',
    name: 'CUET UG',
    category: 'entrance',
    related: ['neet', 'jee-main', 'upsc'],
    presets: [
      { id: 'cuet-photo', doc: 'photo', format: 'jpeg', kb: { min: 10, max: 200 }, px: { cm: [3.5, 4.5], dpi: 200 }, approx: true, source: CUET },
      { id: 'cuet-signature', doc: 'signature', format: 'jpeg', kb: { min: 10, max: 50 }, px: { cm: [5, 2], dpi: 200 }, approx: true, source: CUET },
    ],
  },
  {
    id: 'passport',
    slug: 'passport-seva-photo-size',
    name: 'Passport Seva',
    category: 'identity',
    related: ['pan', 'upsc', 'neet'],
    presets: [
      {
        id: 'passport-photo',
        doc: 'photo',
        format: 'jpeg',
        kb: { min: 10, max: 250 },
        px: { w: 630, h: 810 },
        source: {
          title: 'Passport Seva: Guidelines for ICAO compliant photographs for passport applications',
          url: 'https://mportal.passportindia.gov.in/pdf/Guidelines_for_ICAO_Compliant_Photographs_for_Passport_Applications.pdf',
          verifiedOn: CHECKED,
          partial: true,
          note: 'The guideline confirms 630 × 810 pixels, colour, white background and a face filling 80–85%. It gives no KB limit; 10–250 KB is widely quoted.',
        },
      },
    ],
  },
  {
    id: 'pan',
    slug: 'pan-card-photo-signature-size',
    name: 'PAN card',
    category: 'identity',
    related: ['passport', 'sbi', 'ibps'],
    presets: [
      {
        id: 'pan-photo',
        doc: 'photo',
        format: 'jpeg',
        kb: { max: 20 },
        px: { cm: [2.5, 3.5], dpi: 200 },
        dpi: 200,
        source: { ...PAN, note: 'The page says “3.5 × 2.5 cms”; read here as height × width, a portrait photo.' },
      },
      { id: 'pan-signature', doc: 'signature', format: 'jpeg', kb: { max: 10 }, px: { cm: [4.5, 2], dpi: 200 }, dpi: 200, source: { ...PAN, note: 'The page says “2 × 4.5 cms”: 2 cm tall, 4.5 cm wide.' } },
      { id: 'pan-document', doc: 'document', format: 'pdf', kb: { max: 300 }, source: { ...PAN, note: 'Proofs in black and white at 200 DPI, at most 300 KB per page.' } },
    ],
  },
]

export const examById = (id: string): Exam | undefined => EXAMS.find((e) => e.id === id)
