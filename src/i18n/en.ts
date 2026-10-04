/**
 * Every word on the site. `ui` is used by the tool (and bundled into its JavaScript); `pages` is
 * only used at build time by the Astro pages. A Hindi version is a copy of this file with the
 * same shape.
 */
import type { CheckId, CheckStatus } from '../engine/inspect'
import type { DocKind } from '../data/types'

type P = Record<string, string | number>
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

export const ui = {
  site: 'SahiSize',
  doc: {
    photo: 'Photo',
    signature: 'Signature',
    thumb: 'Thumb impression',
    declaration: 'Declaration',
    document: 'PDF document',
  } satisfies Record<DocKind, string>,
  /** Labels for presets whose document name isn't enough. */
  presetLabel: {
    'ibps-thumb': 'Left thumb',
    'sbi-thumb': 'Left thumb',
    'ibps-declaration': 'Declaration',
    'sbi-declaration': 'Declaration',
    'upsc-signature': 'Signature ×3',
    'neet-photo': 'Passport photo',
    'neet-thumb': 'Finger & thumb impressions',
    'neet-certificate': 'Certificate PDF',
    'jee-main-certificate': 'Certificate PDF',
    'rrb-certificate': 'SC/ST certificate PDF',
    'ibps-certificate': 'Certificate PDF',
    'pan-document': 'Proof PDF',
  } as Record<string, string>,

  picker: {
    choose: 'Choose file',
    camera: 'Take photo',
    drop: 'or drop it here',
    hintPhoto: 'A clear, recent photo on a plain light background works best.',
    hintInk: 'Sign on plain white paper and take a photo in good light. We clean up the rest.',
    hintThumb: 'Press your thumb on an ink pad, then on white paper, and photograph it.',
    hintDeclaration: 'Write the text on white paper in your own handwriting and photograph it.',
    another: 'Use a different file',
  },
  opening: (name: string) => `Opening ${name}…`,
  errors: {
    heic: 'This is an iPhone HEIC photo, which this browser can’t open. On the iPhone, open Settings → Camera → Formats and pick “Most Compatible”, or share the photo to yourself as JPG, then try again.',
    pdf: 'That’s a PDF. Use the PDF tab or the PDF compressor for documents.',
    unsupported: 'This file type can’t be opened. Use a JPG or PNG photo.',
    corrupt: 'This file looks damaged and couldn’t be opened. Try taking or exporting the photo again.',
    engine: 'The image engine couldn’t start. If you are offline, connect once and reload the page; otherwise just reload it.',
  },

  crop: {
    label: 'Crop area',
    help: 'Drag to move. Pinch, scroll or use the buttons to zoom. Keyboard: arrow keys move, + and − zoom, R rotates.',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    rotate: 'Rotate',
    reset: 'Reset',
    faceGuide: 'Keep the face inside the oval: about three quarters of the photo’s height, from chin to the top of the head.',
  },
  photo: {
    auto: 'Fix brightness automatically',
    brightness: 'Brightness',
    contrast: 'Contrast',
    nameDate: 'Print name and date under the photo',
    name: 'Name',
    date: 'Date',
  },
  ink: {
    clean: 'Clean up the background',
    colour: 'Ink colour',
    original: 'As written',
    black: 'Black',
    blue: 'Blue',
    strength: 'Ink strength',
    lighter: 'Lighter',
    darker: 'Darker',
    shape: 'Shape',
    keep: 'Keep proportions',
    stretch: 'Fill the box',
    noInk: 'No ink found in the crop. Move the frame over the signature, or turn off “Clean up the background”.',
    threeTimes: 'UPSC wants three signatures, one below the other, in one photo. Sign three times before you take the picture.',
    declarationText: 'Text to write by hand (check it against your notification):',
    declaration:
      'I, _______ (Name of the candidate), hereby declare that all the information submitted by me in the application form is correct, true and valid. I will present the supporting documents as and when required.',
  },
  custom: {
    title: 'Your target',
    minKb: 'Minimum KB',
    maxKb: 'Maximum KB',
    width: 'Width (px)',
    height: 'Height (px)',
    dpi: 'DPI',
    optional: 'optional',
    keepSize: 'Leave width and height empty to keep the picture’s size and only change the KB.',
    invalid: 'Maximum KB must be more than the minimum.',
  },
  result: {
    working: 'Making your file…',
    title: 'Your file',
    ready: (name: string) => `Ready: ${name}`,
    download: 'Download',
    share: 'Share or save',
    actual: 'Actual size',
    zoomed: 'Zoomed',
    next: (label: string) => `Next: ${label} →`,
    quality: (q: number) => `JPEG quality ${q}`,
    padded: (kb: string) => `Even at the best quality the file was small, so ${kb} of empty padding was added inside it to reach the minimum. The picture itself is unchanged.`,
    fill: (pct: number) => `The ink fills ${pct}% of the box.`,
    fillLow: (pct: number) => `The ink fills only ${pct}% of the box. Crop tighter around the signature (SSC asks for at least 80%).`,
    tooBig: (kb: string) => `Can’t get under the limit without ruining the picture: the smallest we could make was ${kb}. Crop closer, or use a simpler, evenly lit photo.`,
    tooSmall: (kb: string) => `The file came out at ${kb}, under the minimum, and padding is off.`,
    empty: 'Nothing to make yet.',
    noExif: 'Location and camera details (EXIF) are removed from the file.',
    stale: 'Updating…',
  },
  checks: {
    heading: 'What the portal will check',
    format: {
      pass: (p: P) => `File type: ${p.kind}`,
      fail: (p: P) => `File type: this is really a ${p.kind} file, but a ${p.want} is required.`,
    },
    size: {
      pass: (p: P) => `File size: ${p.size} (${new Intl.NumberFormat('en-IN').format(Number(p.bytes))} bytes); allowed: ${p.rule}`,
      warn: (p: P) => `File size: ${p.size} passes only if the portal counts 1 KB as ${p.verdict === 'kib-only' ? '1024' : '1000'} bytes. Aim for the middle of ${p.rule}.`,
      fail: (p: P) => `File size: ${p.size} is ${p.over ? 'over' : 'under'} the limit of ${p.rule}.`,
    },
    dims: {
      pass: (p: P) => `Size: ${p.w} × ${p.h} pixels`,
      warn: (p: P) =>
        p.ww
          ? `Size: ${p.w} × ${p.h} pixels. The notice prefers ${p.ww} × ${p.wh}; most portals only check the KB size, but matching it is safer.`
          : `Size: ${p.w} × ${p.h} pixels is outside the suggested range (${p.minW || 'any'}–${p.maxW || 'any'} × ${p.minH || 'any'}–${p.maxH || 'any'}).`,
      fail: (p: P) =>
        p.ww
          ? `Size: ${p.w} × ${p.h} pixels, but ${p.ww} × ${p.wh} is required.`
          : `Size: ${p.w} × ${p.h} pixels is outside the allowed range (${p.minW || 'any'}–${p.maxW || 'any'} × ${p.minH || 'any'}–${p.maxH || 'any'}).`,
    },
    dpi: {
      pass: (p: P) => `Resolution: ${p.want} DPI`,
      warn: (p: P) => `Resolution: the file says ${p.dpi || 'nothing about'} DPI; ${p.want} DPI is asked for.`,
    },
    color: { fail: () => 'Colours: CMYK (print) colours. Many portals can’t read these; convert to a normal RGB JPG.' },
    progressive: { warn: () => 'Progressive JPG: some older portals can’t read it.' },
    orientation: { warn: () => 'Rotation is stored as a tag. Some portals ignore it and show the photo sideways.' },
    encrypted: { fail: () => 'Password-protected PDF. Portals reject these; remove the password first.' },
    filename: {
      pass: (p: P) => `File name: ${p.name}`,
      warn: (p: P) => `File name: ${filenameAdvice(String(p.problems), String(p.required))}`,
    },
  } as Record<CheckId, Partial<Record<CheckStatus, (p: P) => string>>> & { heading: string },
  checker: {
    pick: 'Which portal is it for?',
    file: 'Choose the file you want to check',
    allGood: 'Looks good for this portal.',
    issues: (n: number) => `${n} ${plural(n, 'problem', 'problems')} to fix.`,
    fix: 'Fix it now',
  },
  pdf: {
    add: 'Add PDFs or photos',
    addMore: 'Add more',
    pages: (n: number) => `${n} ${plural(n, 'page', 'pages')}`,
    target: 'Keep it under (KB)',
    minimum: (kb: number) => `and above ${kb} KB`,
    gray: 'Black and white (much smaller)',
    make: 'Make PDF',
    remake: 'Make again',
    up: 'Move up',
    down: 'Move down',
    rotate: 'Rotate',
    remove: 'Remove',
    page: (n: number) => `Page ${n}`,
    password: 'This PDF is password-protected (e-Aadhaar PDFs are). Enter its password to unlock it; the new PDF won’t need one.',
    passwordLabel: 'PDF password',
    wrongPassword: 'Wrong password. For e-Aadhaar it is the first 4 letters of your name in capitals plus your birth year, e.g. RAHU1990.',
    unlock: 'Unlock',
    loading: 'Loading the PDF engine…',
    progress: (done: number, total: number) => `Working on page ${done} of ${total}…`,
    kept: 'The text in your PDF was kept as text (no quality lost).',
    flattened: (dpi: number) => `Pages were re-drawn at ${dpi} DPI so the file fits. Text is no longer selectable, which portals don’t need.`,
    drawn: (dpi: number) => `Pages were drawn at ${dpi} DPI, the sharpest that fits the limit.`,
    tooBig: (rule: string) => `These pages can’t fit into ${rule}, even at the lowest sharpness that is still readable. Remove pages, switch on black and white, or split the document.`,
    already: 'This PDF already fits. You can upload it as it is.',
    damaged: 'This PDF couldn’t be read. It may be damaged.',
    empty: 'Add at least one PDF or photo.',
  },
  privacy: {
    badge: 'Nothing is uploaded',
    requests: (n: number) => `${n} ${plural(n, 'file', 'files')} loaded since this page opened, all of them this site’s own code. None carried your data.`,
  },
  live: 'This photo is taken live inside the application form, so there is no file to upload. See the tips below.',
  unverified: 'Not yet checked against the official notice. Confirm the numbers in your notification.',
  verified: (date: string) => `Checked against the official notice on ${date}.`,
  partly: (date: string) => `Checked against the official notices on ${date}; some limits could only be partly confirmed (see the table).`,
}

function filenameAdvice(problems: string, required: string): string {
  const list = problems.split(',').filter(Boolean)
  const words: Record<string, string> = {
    spaces: 'remove spaces',
    special: 'use only letters, numbers, - and _',
    'double-ext': 'remove the doubled extension (like .jpg.jpg)',
    'wrong-ext': 'fix the extension so it matches the real file type',
    long: 'shorten it',
    name: `name it “${required}”`,
  }
  return list.map((p) => words[p]).join('; ')
}

export interface Faq {
  q: string
  a: string
}

interface ExamCopy {
  title: string
  description: string
  h1: string
  /** A few words for the home page card. */
  short: string
  intro: string
  covers: string
  note?: string
  rules: Record<string, string[]>
  rejections: string[]
  faq: Faq[]
}

export const pages = {
  layout: {
    skip: 'Skip to the tool',
    nav: { exams: 'Exams', resize: 'Resize photo', pdf: 'Compress PDF', check: 'Check a file', privacy: 'Privacy' },
    menu: 'Menu',
    footer:
      'SahiSize is an independent tool. It is not connected to any government body, exam board or bank. Rules change with every notification, so always check yours.',
    footerLinks: { about: 'About', privacy: 'Privacy', how: 'How it works', report: 'Report a wrong rule' },
    footerExams: 'Exams and forms',
    footerTools: 'Tools',
    toolLabel: (kind: string, kb?: number) =>
      ({
        resize: `Resize image to ${kb} KB`,
        increase: 'Increase size in KB',
        nameDate: 'Photo with name and date',
        pdf: `Compress PDF to ${kb && kb >= 1000 ? `${kb / 1000} MB` : `${kb} KB`}`,
        imagesToPdf: 'Photos to PDF',
        check: 'Check a file before uploading',
      })[kind] ?? kind,
  },
  home: {
    title: 'Photo, Signature & PDF Resizer for Exam Forms (KB, Pixels, DPI) | SahiSize',
    description:
      'Resize your photo, signature, thumb impression and PDF to the exact size IBPS, SBI, SSC, UPSC, RRB, NEET, JEE, Passport Seva and PAN forms ask for. Free, works on your phone, nothing is uploaded.',
    h1: 'Photo, signature and PDF at the exact size your form wants',
    intro:
      'Pick your exam or form, choose your photo, and download a file that matches the official rules: pixels, KB and DPI. Everything happens on your phone or computer; your files never leave it.',
    examsHeading: 'Pick your exam or form',
    toolsHeading: 'Other tools',
    stepsHeading: 'How it works',
    steps: [
      'Choose the exam or form. The rules from its notification are already set.',
      'Take or choose a photo. Crop it, and signatures are cleaned up automatically.',
      'Download a file that passes the size, pixel and type checks, then upload it.',
    ],
    privacyHeading: 'Your photo stays on your device',
    privacyText:
      'SahiSize has no server that could receive files. The page is locked so it cannot send data anywhere, and after the first visit it even works in airplane mode.',
  },
  exam: {
    specHeading: (name: string) => `${name} photo and signature rules`,
    colDoc: 'Document',
    colType: 'Type',
    colSize: 'File size',
    colPx: 'Size in pixels',
    live: 'Taken live in the form',
    any: 'Not fixed',
    stepsHeading: 'Make your files',
    rejectHeading: 'Why uploads get rejected',
    faqHeading: 'Questions',
    relatedHeading: 'Other exams',
    sourceLabel: 'Source',
    toolHeading: (name: string) => `${name} resizer`,
  },
  exams: {
    ibps: {
      title: 'IBPS Photo, Signature, Thumb & Declaration Size 2026 – Resize Online | SahiSize',
      description:
        'Make IBPS PO, Clerk, SO and RRB uploads that pass: photo 200×230 px (20–50 KB), signature 140×60 px (10–20 KB), left thumb, handwritten declaration. Free, nothing uploaded.',
      h1: 'IBPS photo, signature, thumb and declaration size',
      short: 'PO, Clerk, SO and RRB',
      intro:
        'IBPS asks for four scanned images with preferred pixel sizes and strict KB limits, plus your 10th certificate as a PDF. Make each one below: crop the photo, let the tool clean up your signature, thumb impression and declaration, and download files that pass.',
      covers: 'IBPS PO/MT, Clerk, SO and RRB (Officer Scale and Office Assistant) applications.',
      note: 'IBPS also takes a live photo with your webcam or phone during the form, in addition to the photo you upload. Use a recent photo that looks like you today.',
      rules: {
        'ibps-certificate': ['10th / SSLC certificate as a PDF with A4 pages, not over 500 KB, clear and readable.'],
        'ibps-photo': ['Recent colour passport photo, light background, looking straight at the camera.', 'No cap, hat or dark glasses. Religious headwear is allowed but must not cover the face.'],
        'ibps-signature': ['Sign on white paper with a black ink pen.', 'Signatures in CAPITAL LETTERS are not accepted.', 'Only the candidate signs; it must match the signature on the exam day.'],
        'ibps-thumb': ['Left thumb, black or blue ink, on white paper.', 'If you have no left thumb, the notification says how to use the right one.'],
        'ibps-declaration': ['Write the declaration text in English, in your own handwriting, on white paper with black ink.', 'Not in capital letters, and not typed or written by someone else.'],
      },
      rejections: [
        'A photo larger than 50 KB straight from the phone camera.',
        'A signature under 10 KB: a clean signature at 140×60 px is naturally tiny. SahiSize pads the file to reach the minimum without changing the picture.',
        'Signature in capital letters, or written with a pencil or blue gel pen that looks faint.',
        'A photo saved as PNG but renamed to .jpg.',
      ],
      faq: [
        { q: 'What is the IBPS photo size in pixels and KB?', a: '200 × 230 pixels (width × height, “preferred”), between 20 KB and 50 KB, in JPG format.' },
        { q: 'My signature is less than 10 KB. What should I do?', a: 'Choose your signature photo in the Signature tab. If the clean signature is under 10 KB even at the best quality, SahiSize adds harmless padding inside the file so it reaches the minimum.' },
        { q: 'Is the same tool fine for IBPS RRB?', a: 'Yes. IBPS RRB uses the same photo, signature, thumb and declaration rules as PO and Clerk, but always confirm in your notification.' },
        { q: 'Are my photos uploaded to your server?', a: 'No. Everything is done inside your browser. The page is blocked from sending data anywhere.' },
      ],
    },
    sbi: {
      title: 'SBI PO & Clerk Photo, Signature, Thumb & Declaration Size 2026 | SahiSize',
      description:
        'Resize your photo, signature, left thumb impression and handwritten declaration for SBI PO and Clerk (Junior Associate) applications. Exact pixels and KB, free, nothing uploaded.',
      h1: 'SBI PO and Clerk photo, signature, thumb and declaration size',
      short: 'PO and Clerk',
      intro:
        'SBI’s PO and Junior Associate (Clerk) forms use the same four uploads as IBPS. Make each file below and download it at the exact size and KB the form checks.',
      covers: 'SBI PO and SBI Clerk (Junior Associates) recruitment applications.',
      rules: {
        'sbi-photo': ['Recent colour passport photo on a light background.', 'Face clearly visible: no cap or dark glasses.'],
        'sbi-signature': ['Black ink on white paper, signed by the candidate.', 'Capital-letter signatures are not accepted.'],
        'sbi-thumb': ['Left thumb impression in black or blue ink on white paper.'],
        'sbi-declaration': ['Handwritten in English by the candidate, black ink, not in capital letters.'],
      },
      rejections: [
        'Uploading the same photo used years ago: SBI checks it against you at the exam and joining.',
        'A declaration photographed at an angle, with shadows, or with other text in the picture.',
        'Thumb impression smudged into a blob: press lightly and photograph in good light.',
      ],
      faq: [
        { q: 'What is the SBI Clerk photo size?', a: '200 × 230 pixels, 20 KB to 50 KB, JPG. The signature is 140 × 60 pixels, 10 KB to 20 KB.' },
        { q: 'What is written in the SBI handwritten declaration?', a: 'The tool shows the declaration text from recent notifications. Copy it in your own handwriting, and check your notification for any change.' },
        { q: 'Can I take the photos with my phone?', a: 'Yes. Take them in daylight on plain white paper; SahiSize crops, cleans and sizes them.' },
      ],
    },
    ssc: {
      title: 'SSC Signature Size (10–20 KB) & Live Photo Rules 2026 – Resize Online | SahiSize',
      description:
        'SSC CGL, CHSL, MTS, GD and Selection Post: your photo is captured live in the form, and the signature must be a 10–20 KB JPG that fills its box. Make it here; nothing is uploaded.',
      h1: 'SSC signature size and live photo rules',
      short: 'CGL, CHSL, MTS, GD',
      intro:
        'On the new SSC portal you no longer upload a photo: the form takes a live photo with your webcam or phone. You still upload a signature, as a JPG between 10 KB and 20 KB. Make it below, and read the live-photo tips so your form isn’t rejected.',
      covers: 'SSC CGL, CHSL, MTS, GD Constable, Stenographer, JE and Selection Post, on ssc.gov.in.',
      note: 'SSC takes your photo live in the application form, so there is no photo file to resize. Sit facing a window or a bright light, against a plain light wall, without a cap or glasses, and look straight at the camera.',
      rules: {
        'ssc-photo': ['Plain, light background; good, even light on the face.', 'No cap, no spectacles, wear a shirt; look straight at the camera.'],
        'ssc-signature': ['Sign in running handwriting with black ink on white paper: not in capital letters.', 'The signature must fill at least 80% of the box. A small signature in a big white box is rejected.'],
      },
      rejections: [
        'Photo with a patterned background, a cap, or too little light (SSC’s own list of reasons).',
        'Blurred photo: hold the phone still or rest it on something.',
        'A tiny signature with lots of white space around it. SahiSize trims to the ink so it fills the box.',
      ],
      faq: [
        { q: 'Do I need to upload a photo for SSC?', a: 'No. The application module captures your photo live. Only the signature is uploaded.' },
        { q: 'What is the SSC signature size?', a: 'A JPG between 10 KB and 20 KB, about 6 cm wide and 2 cm tall (one part of the notice says about 4 cm wide), with the signature filling the space.' },
        { q: 'Why was my SSC signature rejected?', a: 'Most often it was too small inside the image, in capital letters, or faint. Use the Signature tab: it trims, cleans and sizes it.' },
      ],
    },
    upsc: {
      title: 'UPSC Photo & Signature Size 2026 (New Rules, 3 Signatures) – Resize Online | SahiSize',
      description:
        'New UPSC rules: photo JPG 20–200 KB on a white background, and three signatures stacked in one 20–100 KB image. Crop, clean and size them for free; nothing is uploaded.',
      h1: 'UPSC photo and signature size (new rules)',
      short: 'Civil Services and more',
      intro:
        'UPSC’s new application asks for a photo that matches a live picture taken during the form, and a signature image with your signature written three times. Make both below at the right size.',
      covers: 'UPSC Civil Services and other UPSC examinations applied for on upsconline.',
      note: 'UPSC also takes a live photo during the application and compares it with the photo you upload. Use a recent photo that looks like you today.',
      rules: {
        'upsc-photo': ['Recent colour photo, plain white background, face covering about three quarters of the photo.', 'Look straight at the camera, both ears visible, eyes open, no glasses or cap.', 'Save it as “photo.jpg”.'],
        'upsc-signature': ['Sign three times, one below the other, on white paper with black ink.', 'Photograph all three in one picture; save it as “signature.jpg”.'],
      },
      rejections: [
        'An old photo that doesn’t match the live photo taken in the form.',
        'One signature instead of three.',
        'A photo where the face is small, tilted or in shadow.',
      ],
      faq: [
        { q: 'What is the UPSC photo size in KB?', a: 'A JPG between 20 KB and 200 KB with a white background.' },
        { q: 'Why does UPSC want three signatures?', a: 'The new rules ask for three signatures, one below the other, in one image (20 KB to 100 KB). Sign three times, photograph them together and use the Signature tab.' },
        { q: 'Does SahiSize change my face?', a: 'No. It only crops, adjusts brightness if you ask, resizes and compresses. The face is never edited.' },
      ],
    },
    rrb: {
      title: 'RRB Signature Size (30–49 KB), Live Photo & SC/ST Certificate PDF 2026 | SahiSize',
      description:
        'Railway (RRB) applications: the photo is captured live, the signature must be a 30–49 KB JPG of at least 140 × 60 pixels, and the SC/ST certificate a PDF under 400 KB. Make them here; nothing is uploaded.',
      h1: 'RRB signature size, live photo and certificate PDF',
      short: 'ALP, NTPC, Group D, JE',
      intro:
        'In the latest Railway Recruitment Board notices you don’t upload a photo: the form captures a live one. You upload a signature (a JPG of 30–49 KB) and, for the free travel pass, your SC/ST certificate as a PDF under 400 KB. Make both below.',
      covers: 'RRB Centralised Employment Notices (CEN) on rrbapply.gov.in, such as ALP, NTPC, Group D and JE.',
      note: 'The live photo is matched against you during the process. Face the camera at eye level, in good light, against a plain background, without a cap, mask or glasses. Never photograph an existing photo.',
      rules: {
        'rrb-photo': ['Captured live in the form: good light, plain background, camera at eye level.', 'No cap, mask or glasses; don’t photograph a printed or on-screen photo.'],
        'rrb-signature': ['Black ink on white paper, in running (joined) handwriting: not block, capital or disjointed letters.', 'Scanned at 100 DPI or more, at least 140 × 60 pixels, centred in a 35 × 20 mm box.'],
        'rrb-certificate': ['SC/ST certificate as a PDF under 400 KB, clear and valid on the closing date.'],
      },
      rejections: [
        'A non-white background or non-black ink in the signature.',
        'A signature in capital or block letters, blurred, or cut off at the edges.',
        'A thumb impression in place of the signature.',
      ],
      faq: [
        { q: 'What is the RRB signature size?', a: 'A JPG between 30 KB and 49 KB, at least 140 × 60 pixels. A clean signature is usually smaller, so SahiSize pads the file up to the minimum without changing the picture.' },
        { q: 'Do I upload a photo for RRB?', a: 'No, in the latest notices the application captures a live photo. Older notices differ, so check yours.' },
        { q: 'How do I get my SC/ST certificate under 400 KB?', a: 'Use the Certificate PDF tab. It keeps the PDF as it is if it already fits, or re-draws the pages so it does.' },
      ],
    },
    neet: {
      title: 'NEET UG 2026 Photo, Signature & Finger/Thumb Impression Size – Resize Online | SahiSize',
      description:
        'NEET UG uploads at the size NTA asks for: photo 10–200 KB, signature 10–100 KB, finger and thumb impressions, and certificate PDFs of 50–300 KB. Free, nothing uploaded.',
      h1: 'NEET UG photo, signature and finger/thumb impression size',
      short: 'Medical entrance',
      intro:
        'The NEET (UG) form asks for a recent photo, your signature, an image of your left and right hand fingers and thumb impressions, and several certificates as PDF. Make each one below.',
      covers: 'NEET (UG) applications on neet.nta.nic.in.',
      note: 'NTA also captures a live photo during the form and matches it with your Aadhaar photo. Keep 6–8 passport-size and 4–6 postcard-size (4 × 6 inch) prints with a white background for later; there is no postcard upload this year.',
      rules: {
        'neet-photo': ['Recent passport-size photo, colour or black and white, white background.', 'About 80% of the picture is your face, ears visible, no mask; spectacles only if you wear them regularly.'],
        'neet-signature': ['Your signature in JPG, clearly legible.'],
        'neet-thumb': ['Left and right hand fingers and thumb impressions, clear enough to see the lines.'],
        'neet-certificate': ['Class 10 certificate, marksheet, category certificate and address proof each as a clear PDF of 50–300 KB.'],
      },
      rejections: ['A photo with a coloured background or a face covered by a mask or hair.', 'Smudged impressions where the lines can’t be seen.', 'A computer-made or edited photo: NTA treats it as unfair means.'],
      faq: [
        { q: 'What is the NEET photo size?', a: 'A JPG between 10 KB and 200 KB, with about 80% of it your face, on a white background.' },
        { q: 'What is the NEET signature size?', a: 'A JPG between 10 KB and 100 KB.' },
        { q: 'Which KB limit applies to the finger and thumb impressions?', a: 'The 2026 bulletin says 10–200 KB in one place and 50–300 KB in another. SahiSize aims for 50–200 KB, which passes both.' },
      ],
    },
    'jee-main': {
      title: 'JEE Main 2026 Photo & Signature Size – Resize Online | SahiSize',
      description:
        'Resize your JEE Main photo and signature and compress your category certificate PDF to the size NTA asks for. Free, works on your phone, nothing uploaded.',
      h1: 'JEE Main photo and signature size',
      short: 'Engineering entrance',
      intro: 'The JEE Main form asks for a recent photo, your signature and, if you claim a category, a certificate PDF. Make each one below.',
      covers: 'JEE Main applications on jeemain.nta.nic.in.',
      note: 'NTA also captures a live photo while you fill in the form, in addition to the photo you upload.',
      rules: {
        'jee-main-photo': ['Recent colour passport photo, white background, 80% face visible with ears, no mask.'],
        'jee-main-signature': ['Your own signature, clearly legible.'],
        'jee-main-certificate': ['Class 10 certificate or marksheet as a clear PDF; a PwD/UDID certificate has the same limit.'],
      },
      rejections: ['A selfie with a busy background.', 'A signature photographed in dim light that looks grey.'],
      faq: [
        { q: 'What is the JEE Main photo size?', a: 'A JPG between 10 KB and 200 KB with a white background.' },
        { q: 'What is the JEE Main signature size?', a: 'A JPG between 10 KB and 100 KB.' },
        { q: 'Can I use the same photo as NEET?', a: 'Yes, if it is recent and meets both forms’ rules. Make a separate file for each form here.' },
      ],
    },
    cuet: {
      title: 'CUET UG 2026 Photo & Signature Size – Resize Online | SahiSize',
      description: 'Resize your CUET UG photo and signature to the size NTA asks for. Free, on your phone, nothing uploaded.',
      h1: 'CUET UG photo and signature size',
      short: 'University entrance',
      intro: 'CUET UG asks for a recent photo and your signature as JPG files. Make both below.',
      covers: 'CUET UG applications on cuet.nta.nic.in.',
      rules: {
        'cuet-photo': ['Recent colour photo, white background, at least 80% face visible with ears, no mask.'],
        'cuet-signature': ['Clear signature in black ink on white paper.'],
      },
      rejections: ['A photo with the face too small.', 'A signature that is blurred or cut off.'],
      faq: [
        { q: 'What is the CUET photo size?', a: 'A JPG between 10 KB and 200 KB.' },
        { q: 'What is the CUET signature size?', a: 'A JPG between 10 KB and 50 KB.' },
      ],
    },
    passport: {
      title: 'Passport Seva Photo Size 630×810 px (JPG, 10–250 KB) – Resize Online | SahiSize',
      description:
        'Make a Passport Seva photo that passes the portal’s automatic check: exactly 630 × 810 pixels, JPG, 10–250 KB, white background. Free and private.',
      h1: 'Passport Seva photo size (630 × 810 pixels)',
      short: 'Passport photo upload',
      intro:
        'Where the Passport Seva portal asks you to upload a photo, it checks it automatically: the size in pixels must be exact and the file a JPG within the KB limit. Crop and size yours below.',
      covers: 'Indian passport applications on the Passport Seva portal (where a photo upload is asked for).',
      rules: {
        'passport-photo': ['Plain white background, colour photo, face centred and looking at the camera.', 'Eyes open, no glasses, neutral expression, taken in the last six months.'],
      },
      rejections: ['Any size other than exactly 630 × 810 pixels.', 'An off-white or shadowed background.', 'A photo with glasses or a tilted head.'],
      faq: [
        {
          q: 'What size is the Passport Seva photo upload?',
          a: 'Exactly 630 × 810 pixels, in colour, with a white background and the face filling 80–85% of the photo. The official guideline gives no KB limit; SahiSize keeps it between 10 KB and 250 KB, the range usually quoted.',
        },
      ],
    },
    pan: {
      title: 'PAN Card Photo & Signature Size (Protean, UTIITSL) – Resize Online | SahiSize',
      description:
        'Online PAN application (Protean/NSDL): photo 3.5 × 2.5 cm at 200 DPI up to 20 KB, signature 2 × 4.5 cm up to 10 KB, proofs up to 300 KB per page. Make them here; nothing is uploaded.',
      h1: 'PAN card photo and signature size',
      short: 'Photo, signature, proofs',
      intro: 'Online PAN applications with scanned uploads ask for a photo and signature at 200 DPI with tight KB limits, and proofs as PDF. Make them below.',
      covers: 'Online PAN applications on the Protean (NSDL) site that ask for scanned images. UTIITSL’s limits may differ; check its page.',
      rules: {
        'pan-photo': ['Colour photo, 3.5 × 2.5 cm at 200 DPI, at most 20 KB.'],
        'pan-signature': ['Signature, 2 × 4.5 cm at 200 DPI, at most 10 KB.'],
        'pan-document': ['Proofs of identity, address and date of birth in black and white at 200 DPI, at most 300 KB per page.'],
      },
      rejections: ['A photo over 20 KB or a signature over 10 KB.', 'A photo or signature saved without the 200 DPI setting.', 'A proof PDF over the size limit.'],
      faq: [
        { q: 'What is the PAN card photo size?', a: '3.5 × 2.5 cm at 200 DPI, a colour JPG of at most 20 KB (Protean’s online application).' },
        { q: 'What is the PAN card signature size?', a: '2 × 4.5 cm at 200 DPI, a JPG of at most 10 KB.' },
      ],
    },
  } satisfies Record<string, ExamCopy>,
  generic: {
    resizeKb: (kb: number) => ({
      title: `Resize Image to ${kb} KB Online (Photo & Signature) – Free | SahiSize`,
      description: `Reduce a photo or signature to under ${kb} KB as a JPG, with optional exact pixel size and DPI. Works on your phone; nothing is uploaded.`,
      h1: `Resize an image to ${kb} KB`,
      intro: `Choose a photo and get a JPG under ${kb} KB with the best quality that fits. Set a minimum too, if your form has one, and a pixel size if it asks for one.`,
    }),
    increase: {
      title: 'Increase Photo or Signature Size in KB (e.g. to 20 KB) – Free | SahiSize',
      description: 'Your signature is under the minimum, like 10 or 20 KB? Make it bigger in KB without changing how it looks. Free and private.',
      h1: 'Increase a photo or signature’s size in KB',
      intro:
        'Forms that ask for “10–20 KB” reject files that are too small, and a clean signature is often only a few KB. Set the minimum below: we use the best quality and, if needed, add harmless padding inside the file so it reaches the minimum.',
    },
    nameDate: {
      title: 'Photo with Name and Date Online (Below the Photo) – Free | SahiSize',
      description: 'Add your name and the date in a white strip under your passport photo, at the pixel size and KB your form asks for. Free, nothing uploaded.',
      h1: 'Photo with name and date',
      intro: 'Some forms want your name and the date the photo was taken printed under it. Type them below, choose the size and download the photo.',
    },
    pdfKb: (kb: number) => ({
      title: `Compress PDF to ${kb >= 1000 ? `${kb / 1000} MB` : `${kb} KB`} Online – Free, Private | SahiSize`,
      description: `Reduce a PDF to under ${kb >= 1000 ? `${kb / 1000} MB` : `${kb} KB`} for an exam or government upload, including password-protected e-Aadhaar PDFs. Nothing is uploaded.`,
      h1: `Compress a PDF to ${kb >= 1000 ? `${kb / 1000} MB` : `${kb} KB`}`,
      intro: 'Choose your PDF or photos of your document. SahiSize keeps the text if the file already fits, otherwise it re-draws the pages at the sharpest quality that fits the limit.',
    }),
    imagesToPdf: {
      title: 'Photos to PDF Under 200 KB (Certificates, Marksheets) – Free | SahiSize',
      description: 'Turn photos of certificates or marksheets into one PDF under the KB limit your form asks for. Reorder, rotate, black and white. Nothing is uploaded.',
      h1: 'Photos to PDF, under a size limit',
      intro: 'Take photos of each page, add them here in order, and get one PDF that fits the limit.',
    },
    check: {
      title: 'Check Photo, Signature or PDF Before Uploading (Size, KB, Pixels) | SahiSize',
      description: 'Find out why a portal rejects your file: real file type, KB, pixels, DPI, rotation and file name, checked against your exam’s rules. Nothing is uploaded.',
      h1: 'Check a file before you upload it',
      intro: 'Choose the file and the portal. You’ll see every rule the portal checks, what fails and how to fix it.',
    },
  },
  privacyPage: {
    title: 'Privacy: Your Files Never Leave Your Device | SahiSize',
    description: 'How SahiSize keeps your photos and documents on your device: no server, a locked page that cannot send data, no analytics, no cookies.',
    h1: 'Your files never leave your device',
  },
  howPage: {
    title: 'How SahiSize Hits an Exact KB Size in the Browser | SahiSize',
    description: 'The engineering behind SahiSize: finding the best JPEG quality under a KB limit, padding a file to a minimum, cleaning signatures, and building PDFs, all in your browser.',
    h1: 'How it works',
  },
  aboutPage: {
    title: 'About SahiSize | SahiSize',
    description: 'SahiSize is a free, independent tool that makes exam and government form uploads the exact size they need to be.',
    h1: 'About SahiSize',
  },
  notFound: { title: 'Page not found | SahiSize', h1: 'Page not found', text: 'That page doesn’t exist. Pick your exam from the home page.' },
}
