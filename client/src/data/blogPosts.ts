import { FileText, Building2, Home, Stethoscope, Cpu, Users, Landmark, GraduationCap, Briefcase, FileSignature, Receipt, LucideIcon } from "lucide-react";

import scannedPdfImg from "@assets/stock_images/professional_busines_b81f9cac.jpg";
import nonFillableImg from "@assets/stock_images/professional_busines_ed3e9831.jpg";
import hrOnboardingImg from "@assets/stock_images/hr_human_resources_o_f9e19f49.jpg";
import hrImg from "@assets/stock_images/hr_human_resources_o_e99ff216.jpg";
import w4FormImg from "@assets/stock_images/professional_busines_3d4604f2.jpg";
import realEstateImg from "@assets/stock_images/real_estate_agent_co_4d517617.jpg";
import medicalImg from "@assets/stock_images/medical_healthcare_p_f540f681.jpg";
import ocrImg from "@assets/stock_images/digital_technology_s_4197ef26.jpg";
import autofillImg from "@assets/stock_images/digital_technology_s_91e3cb80.jpg";
import bulkImg from "@assets/stock_images/real_estate_agent_co_d682ae28.jpg";
import governmentImg from "@assets/stock_images/government_forms_doc_d88c3821.jpg";
import signatureImg from "@assets/stock_images/electronic_signature_999c1e67.jpg";
import schoolImg from "@assets/stock_images/school_teacher_educa_db287b98.jpg";
import rentalImg from "@assets/stock_images/rental_apartment_lea_d29571cf.jpg";
import taxImg from "@assets/stock_images/government_forms_doc_00b4e4fb.jpg";
import contractImg from "@assets/stock_images/electronic_signature_25b68e4c.jpg";

export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  categorySlug: string;
  categoryIcon: LucideIcon;
  readTime: string;
  image: string;
  publishedAt: string;
  keywords: string[];
  featured?: boolean;
}

export const blogPosts: BlogPost[] = [
  {
    slug: "fill-out-scanned-pdf-forms-online",
    title: "How to Fill Out Any Scanned PDF Online (Fastest Method for 2025)",
    excerpt: "Scanned PDFs are everywhere — rental applications, HR forms, medical intake sheets. Learn the fastest way to fill them out without printing or scanning.",
    category: "How-To Guides",
    categorySlug: "how-to",
    categoryIcon: FileText,
    readTime: "4 min read",
    image: scannedPdfImg,
    publishedAt: "2025-01-15",
    keywords: ["scanned PDF", "fill PDF online", "PDF form filler"],
    featured: true
  },
  {
    slug: "convert-non-fillable-pdf-to-fillable",
    title: "Convert Non-Fillable PDFs Into Fillable Forms (100% Online)",
    excerpt: "Non-fillable PDFs waste countless hours. This guide shows how to convert any static PDF into a clean online form with zero software.",
    category: "How-To Guides",
    categorySlug: "how-to",
    categoryIcon: FileText,
    readTime: "3 min read",
    image: nonFillableImg,
    publishedAt: "2025-01-12",
    keywords: ["non-fillable PDF", "convert PDF", "fillable form"]
  },
  {
    slug: "fill-government-pdf-forms-online",
    title: "Fill Government PDF Forms Online Without Printing (2025 Guide)",
    excerpt: "Government PDF forms are famously painful: long, rigid, often non-fillable. Here's how to fill federal and state forms online fast, with zero software.",
    category: "Government",
    categorySlug: "government",
    categoryIcon: Landmark,
    readTime: "5 min read",
    image: governmentImg,
    publishedAt: "2025-01-14",
    keywords: ["government forms", "IRS forms", "USCIS forms", "federal forms"]
  },
  {
    slug: "sign-pdf-online-any-device",
    title: "The Best Way to Sign a PDF on Any Device (Without Installing Anything)",
    excerpt: "You shouldn't need Adobe Acrobat, a printer, or a scanner just to sign a PDF. Here's how to sign any PDF instantly on your phone, laptop, or tablet.",
    category: "How-To Guides",
    categorySlug: "how-to",
    categoryIcon: FileSignature,
    readTime: "3 min read",
    image: signatureImg,
    publishedAt: "2025-01-13",
    keywords: ["sign PDF", "digital signature", "e-signature", "online signature"]
  },
  {
    slug: "hr-onboarding-form-automation",
    title: "HR Onboarding Form Automation: Eliminate Paperwork Bottlenecks",
    excerpt: "HR teams process stacks of onboarding documents. Learn how to automate employment agreements, benefits forms, and tax documents.",
    category: "HR & Employment",
    categorySlug: "hr",
    categoryIcon: Users,
    readTime: "5 min read",
    image: hrOnboardingImg,
    publishedAt: "2025-01-10",
    keywords: ["HR forms", "onboarding automation", "employee paperwork"]
  },
  {
    slug: "i9-form-filler-online",
    title: "I-9 Form Filler Online: Complete Employment Verification Digitally",
    excerpt: "U.S. employers must complete Form I-9 for every employee. Digitize the process to ensure compliance and reduce errors.",
    category: "HR & Employment",
    categorySlug: "hr",
    categoryIcon: Users,
    readTime: "4 min read",
    image: hrImg,
    publishedAt: "2025-01-08",
    keywords: ["I-9 form", "employment verification", "HR compliance"]
  },
  {
    slug: "w4-form-digital-completion",
    title: "W-4 Form: How to Fill Out Employee's Withholding Certificate",
    excerpt: "Starting a new job? You'll need Form W-4. Fill it incorrectly and you could face a surprise tax bill. Here's how to complete it correctly.",
    category: "Tax Forms",
    categorySlug: "tax",
    categoryIcon: Receipt,
    readTime: "8 min read",
    image: w4FormImg,
    publishedAt: "2025-01-05",
    keywords: ["W-4 form", "tax withholding", "IRS forms", "employee withholding", "new job"]
  },
  {
    slug: "fill-tax-forms-online-1040-1099-w2",
    title: "How to Fill Out Tax Forms Online (1040, 1099, W-2) Without Printing",
    excerpt: "Tax season is stressful — paperwork shouldn't be. Here's the fastest way to fill IRS tax forms online without printing or scanning.",
    category: "Tax Forms",
    categorySlug: "tax",
    categoryIcon: Receipt,
    readTime: "4 min read",
    image: taxImg,
    publishedAt: "2025-01-04",
    keywords: ["1040 form", "1099 form", "W-2 form", "tax forms online"]
  },
  {
    slug: "real-estate-contract-pdf-filler",
    title: "Real Estate Contract PDF Filler: Close Deals Faster",
    excerpt: "Real estate agents manage purchase contracts, lease agreements, and disclosure forms. Learn how to fill them precisely and get signatures faster.",
    category: "Real Estate",
    categorySlug: "real-estate",
    categoryIcon: Home,
    readTime: "5 min read",
    image: realEstateImg,
    publishedAt: "2025-01-03",
    keywords: ["real estate contracts", "lease agreement", "property forms"]
  },
  {
    slug: "landlord-lease-agreement-automation",
    title: "How Landlords Can Streamline Lease Agreements With AutoFillPDF",
    excerpt: "Lease agreements require precision. AutoFillPDF simplifies the entire workflow with digital signatures and autofill for landlord info.",
    category: "Real Estate",
    categorySlug: "real-estate",
    categoryIcon: Home,
    readTime: "4 min read",
    image: rentalImg,
    publishedAt: "2025-01-02",
    keywords: ["lease agreement", "landlord forms", "rental PDF"]
  },
  {
    slug: "medical-intake-form-digitizer",
    title: "Medical Intake Form Digitizer: Modernize Your Practice",
    excerpt: "Healthcare practices need to collect patient information efficiently. Digital intake forms improve the patient experience and speed up workflows.",
    category: "Healthcare",
    categorySlug: "healthcare",
    categoryIcon: Stethoscope,
    readTime: "5 min read",
    image: medicalImg,
    publishedAt: "2025-01-01",
    keywords: ["medical forms", "patient intake", "healthcare PDF"]
  },
  {
    slug: "school-enrollment-forms-digital",
    title: "How Teachers & Schools Can Convert Enrollment Forms to Digital PDFs",
    excerpt: "Schools rely on endless PDFs — permission slips, enrollment forms, medical forms. Digitizing them saves staff hours and makes life easier for parents.",
    category: "Education",
    categorySlug: "education",
    categoryIcon: GraduationCap,
    readTime: "4 min read",
    image: schoolImg,
    publishedAt: "2024-12-30",
    keywords: ["school forms", "enrollment forms", "education PDF"]
  },
  {
    slug: "automate-business-contracts-ndas",
    title: "How Small Businesses Can Automate Contracts, NDAs & Agreements",
    excerpt: "Small businesses send contracts constantly — NDAs, service agreements, onboarding forms. AutoFillPDF lets you automate this paperwork with minimal effort.",
    category: "Business",
    categorySlug: "business",
    categoryIcon: Briefcase,
    readTime: "4 min read",
    image: contractImg,
    publishedAt: "2024-12-29",
    keywords: ["business contracts", "NDA", "agreements", "automation"]
  },
  {
    slug: "pdf-form-ocr-software",
    title: "PDF Form OCR Software: How AutoFillPDF Reads Any Document",
    excerpt: "Converting scanned forms requires robust OCR. Learn how AutoFillPDF's AI-powered OCR delivers higher accuracy than generic tools.",
    category: "Technology",
    categorySlug: "technology",
    categoryIcon: Cpu,
    readTime: "6 min read",
    image: ocrImg,
    publishedAt: "2024-12-28",
    keywords: ["OCR", "optical character recognition", "PDF technology"]
  },
  {
    slug: "autofill-pdf-forms-from-profile",
    title: "Autofill PDF Forms From Profile: Save Time on Every Form",
    excerpt: "Re-entering your name, address, and contact details is tedious. Learn how to save your information and autofill forms with one click.",
    category: "Features",
    categorySlug: "features",
    categoryIcon: FileText,
    readTime: "3 min read",
    image: autofillImg,
    publishedAt: "2024-12-25",
    keywords: ["autofill", "form automation", "saved profiles"]
  },
  {
    slug: "bulk-pdf-form-processing-hr",
    title: "Bulk PDF Form Processing for HR: Scale Your Onboarding",
    excerpt: "Large HR teams must generate hundreds of forms. Learn how bulk processing can create personalized PDFs for each employee in minutes.",
    category: "Enterprise",
    categorySlug: "enterprise",
    categoryIcon: Building2,
    readTime: "5 min read",
    image: bulkImg,
    publishedAt: "2024-12-20",
    keywords: ["bulk PDF", "enterprise", "HR automation"]
  },
  {
    slug: "fill-w9-forms-online",
    title: "Fill W-9 Forms Online: Fastest Method for Contractors & Freelancers",
    excerpt: "Every contractor fills out dozens of W-9 forms each year. Learn the fastest way to fill and submit W-9s professionally without printing.",
    category: "Tax Forms",
    categorySlug: "tax",
    categoryIcon: Receipt,
    readTime: "4 min read",
    image: w4FormImg,
    publishedAt: "2025-01-11",
    keywords: ["W-9 form", "contractor forms", "freelancer paperwork", "IRS W-9"]
  },
  {
    slug: "rental-application-pdf-online",
    title: "The Renter's Guide to Filling Rental PDFs Online (Fast & Easy)",
    excerpt: "Apartment applications involve repetitive PDF paperwork. Here's the fastest way to fill rental PDFs online without printing anything.",
    category: "Real Estate",
    categorySlug: "real-estate",
    categoryIcon: Home,
    readTime: "4 min read",
    image: rentalImg,
    publishedAt: "2025-01-09",
    keywords: ["rental application", "rental agreement", "tenant forms", "lease application"]
  },
  {
    slug: "fill-uscis-forms-online",
    title: "Fill I-130, I-485 & USCIS PDFs Online (No Printing Required)",
    excerpt: "Immigration forms are long, complex, and often non-fillable. AutoFillPDF offers a way to fill USCIS PDFs neatly and digitally.",
    category: "Government",
    categorySlug: "government",
    categoryIcon: Landmark,
    readTime: "5 min read",
    image: governmentImg,
    publishedAt: "2025-01-07",
    keywords: ["USCIS forms", "I-130", "I-485", "immigration forms", "green card"]
  },
  {
    slug: "turn-paper-forms-digital-ocr",
    title: "Turn Paper Forms Into Digital PDFs Using OCR (Easy Guide)",
    excerpt: "OCR (Optical Character Recognition) lets you convert paper forms into digital, fillable PDFs instantly. Here's how to do it.",
    category: "Technology",
    categorySlug: "technology",
    categoryIcon: Cpu,
    readTime: "4 min read",
    image: ocrImg,
    publishedAt: "2025-01-06",
    keywords: ["OCR", "paper to digital", "convert paper form", "scan to PDF"]
  },
  {
    slug: "create-fillable-pdf-without-adobe",
    title: "Create a Fillable PDF Online Without Adobe Acrobat",
    excerpt: "Adobe Acrobat is powerful — but expensive and complicated. AutoFillPDF gives you a simple online alternative with no software to install.",
    category: "How-To Guides",
    categorySlug: "how-to",
    categoryIcon: FileText,
    readTime: "3 min read",
    image: autofillImg,
    publishedAt: "2024-12-27",
    keywords: ["fillable PDF", "Adobe alternative", "PDF filler", "no software"]
  },
  {
    slug: "real-estate-digital-signatures",
    title: "Digital Signatures for Real Estate Agents (2025 Guide)",
    excerpt: "Agents manage nonstop paperwork — disclosures, contracts, addendums. Digital signatures speed everything up and close deals faster.",
    category: "Real Estate",
    categorySlug: "real-estate",
    categoryIcon: Home,
    readTime: "4 min read",
    image: realEstateImg,
    publishedAt: "2024-12-22",
    keywords: ["real estate signature", "contract signing", "e-signature", "agent forms"]
  },
  {
    slug: "ds-11-passport-application-online",
    title: "DS-11 Passport Application: How to Fill Out Online",
    excerpt: "Applying for your first U.S. passport? Learn how to fill out Form DS-11 online before your appointment to save time and avoid common errors.",
    category: "Government",
    categorySlug: "government",
    categoryIcon: Landmark,
    readTime: "6 min read",
    image: governmentImg,
    publishedAt: "2025-01-12",
    keywords: ["DS-11", "passport application", "first passport", "State Department", "passport form"]
  },
  {
    slug: "ds-82-passport-renewal-online",
    title: "DS-82 Passport Renewal: Fill & Sign Online",
    excerpt: "Renewing your U.S. passport? Complete your DS-82 online, sign it digitally, and mail it in — no appointment needed.",
    category: "Government",
    categorySlug: "government",
    categoryIcon: Landmark,
    readTime: "7 min read",
    image: governmentImg,
    publishedAt: "2025-01-13",
    keywords: ["DS-82", "passport renewal", "renew passport", "mail-in passport", "State Department"]
  },
  {
    slug: "irs-form-4506-t-tax-transcript-online",
    title: "IRS Form 4506-T: How to Fill Out Tax Transcript Request Online",
    excerpt: "Need a tax transcript for a mortgage, loan, or rental application? Learn how to fill out Form 4506-T correctly to avoid IRS rejection.",
    category: "Tax Forms",
    categorySlug: "tax",
    categoryIcon: Receipt,
    readTime: "5 min read",
    image: w4FormImg,
    publishedAt: "2025-01-14",
    keywords: ["4506-T", "tax transcript", "IRS form", "mortgage application", "income verification"]
  },
  {
    slug: "1099-nec-form-guide",
    title: "1099-NEC Form: Complete Guide to Filling Out Nonemployee Compensation",
    excerpt: "Paid a contractor $600 or more? Learn how to fill out Form 1099-NEC correctly to avoid IRS penalties and processing delays.",
    category: "Tax Forms",
    categorySlug: "tax",
    categoryIcon: Receipt,
    readTime: "6 min read",
    image: w4FormImg,
    publishedAt: "2025-01-15",
    keywords: ["1099-NEC", "contractor payments", "nonemployee compensation", "IRS form", "freelancer"]
  },
  {
    slug: "autofillpdf-vs-adobe-fill-sign",
    title: "AutoFillPDF vs Adobe Fill & Sign: Which PDF Form Filler Is Better?",
    excerpt: "Comparing AutoFillPDF to Adobe Fill & Sign? See how the two PDF form fillers stack up on pricing, OCR, autofill, and ease of use.",
    category: "Comparisons",
    categorySlug: "features",
    categoryIcon: FileText,
    readTime: "5 min read",
    image: autofillImg,
    publishedAt: "2025-01-16",
    keywords: ["Adobe alternative", "PDF comparison", "form filler", "Adobe Fill Sign", "best PDF tool"]
  },
  {
    slug: "autofillpdf-vs-pdffiller",
    title: "AutoFillPDF vs PDFfiller: Honest Comparison for 2025",
    excerpt: "PDFfiller has been around since 2008, while AutoFillPDF is newer and more focused. Here's an honest comparison of pricing, features, and use cases.",
    category: "Comparisons",
    categorySlug: "features",
    categoryIcon: FileText,
    readTime: "6 min read",
    image: autofillImg,
    publishedAt: "2025-01-17",
    keywords: ["PDFfiller alternative", "PDF comparison", "form filler", "PDFfiller vs", "best PDF tool"]
  },
  {
    slug: "ultimate-guide-filling-pdf-online-2025",
    title: "The Ultimate Guide to Filling Any PDF Online in 2025",
    excerpt: "PDF forms are everywhere — tax documents, passport applications, employment paperwork. This guide covers everything you need to know about filling PDFs online.",
    category: "How-To Guides",
    categorySlug: "how-to",
    categoryIcon: FileText,
    readTime: "12 min read",
    image: autofillImg,
    publishedAt: "2025-01-18",
    keywords: ["fill PDF online", "PDF guide", "how to fill PDF", "digital signature", "OCR PDF"]
  },
  {
    slug: "w9-form-how-to-fill-out",
    title: "W-9 Form: How to Fill Out Request for Taxpayer Identification Number",
    excerpt: "Form W-9 is one of the most frequently requested tax forms. If you're a freelancer or contractor, here's how to complete it correctly.",
    category: "Tax Forms",
    categorySlug: "tax",
    categoryIcon: Receipt,
    readTime: "7 min read",
    image: w4FormImg,
    publishedAt: "2025-01-19",
    keywords: ["W-9", "TIN", "taxpayer identification", "contractor form", "freelancer tax"]
  },
  {
    slug: "adobe-acrobat-alternatives-2025",
    title: "Best Adobe Acrobat Alternatives for PDF Form Filling in 2025",
    excerpt: "Adobe Acrobat is expensive and packed with features most people never use. Here are better, more affordable alternatives for filling PDF forms.",
    category: "Comparisons",
    categorySlug: "features",
    categoryIcon: FileText,
    readTime: "8 min read",
    image: autofillImg,
    publishedAt: "2025-01-20",
    keywords: ["Adobe alternative", "PDF software", "Acrobat replacement", "cheap PDF filler", "free PDF tool"]
  },
  {
    slug: "form-i9-employment-eligibility-guide",
    title: "Form I-9: Employment Eligibility Verification Complete Guide",
    excerpt: "Every U.S. employer must complete Form I-9 for each employee. Errors can result in fines of $272-$2,701 per form. Here's how to fill it correctly.",
    category: "HR & Employment",
    categorySlug: "hr",
    categoryIcon: Users,
    readTime: "10 min read",
    image: hrImg,
    publishedAt: "2025-01-21",
    keywords: ["I-9", "employment eligibility", "work authorization", "USCIS", "employee verification"]
  },
  {
    slug: "ds-3053-consent-minor-passport",
    title: "DS-3053: Statement of Consent for Minor Passport Application",
    excerpt: "Applying for a passport for a child under 16? If one parent can't appear in person, you'll need Form DS-3053. Here's how to complete it correctly.",
    category: "Government",
    categorySlug: "government",
    categoryIcon: Landmark,
    readTime: "9 min read",
    image: governmentImg,
    publishedAt: "2025-01-22",
    keywords: ["DS-3053", "minor passport", "parental consent", "child passport", "State Department"]
  },
  {
    slug: "autofillpdf-vs-docusign",
    title: "AutoFillPDF vs DocuSign: Which Tool for PDF Forms?",
    excerpt: "AutoFillPDF and DocuSign both handle PDFs, but they're designed for completely different purposes. Here's what each does best.",
    category: "Comparisons",
    categorySlug: "features",
    categoryIcon: FileText,
    readTime: "7 min read",
    image: autofillImg,
    publishedAt: "2025-01-23",
    keywords: ["DocuSign alternative", "PDF comparison", "e-signature", "form filler vs signature"]
  },
  {
    slug: "digital-signatures-101-guide",
    title: "Digital Signatures 101: Everything You Need to Know",
    excerpt: "Are digital signatures legal? How do they work? When can you use them? This guide covers everything about signing documents electronically.",
    category: "How-To Guides",
    categorySlug: "how-to",
    categoryIcon: FileText,
    readTime: "11 min read",
    image: signatureImg,
    publishedAt: "2025-01-24",
    keywords: ["digital signature", "e-signature", "electronic signature", "ESIGN Act", "legally binding"]
  },
  {
    slug: "renter-background-check-form-guide",
    title: "Renter Background Check Form: How to Fill Out for Landlords",
    excerpt: "Applying for an apartment? Here's how to complete rental background check forms correctly to maximize your approval chances.",
    category: "Real Estate",
    categorySlug: "real-estate",
    categoryIcon: Home,
    readTime: "12 min read",
    image: rentalImg,
    publishedAt: "2025-01-25",
    keywords: ["rental application", "background check", "tenant screening", "apartment application", "landlord forms"]
  },
  {
    slug: "1099-misc-form-guide",
    title: "1099-MISC Form: Complete Guide to Miscellaneous Income Reporting",
    excerpt: "Form 1099-MISC reports rent, royalties, prizes, and other income. Learn when to use it vs 1099-NEC and how to complete it correctly.",
    category: "Tax Forms",
    categorySlug: "tax",
    categoryIcon: Receipt,
    readTime: "10 min read",
    image: taxImg,
    publishedAt: "2025-01-26",
    keywords: ["1099-MISC", "miscellaneous income", "rent reporting", "royalties", "IRS form"]
  },
  {
    slug: "autofillpdf-vs-jotform",
    title: "AutoFillPDF vs JotForm: Form Filler vs Form Builder Comparison",
    excerpt: "AutoFillPDF fills existing PDFs. JotForm builds new forms. They solve completely different problems. Here's how to choose.",
    category: "Comparisons",
    categorySlug: "features",
    categoryIcon: FileText,
    readTime: "9 min read",
    image: autofillImg,
    publishedAt: "2025-01-27",
    keywords: ["JotForm alternative", "form builder", "form filler", "PDF comparison", "create forms"]
  },
  {
    slug: "form-941-x-payroll-tax-correction",
    title: "Form 941-X: How to Correct Payroll Tax Errors",
    excerpt: "Made an error on your quarterly payroll tax return? Form 941-X lets you correct mistakes. Here's how to complete it correctly.",
    category: "Tax Forms",
    categorySlug: "tax",
    categoryIcon: Receipt,
    readTime: "11 min read",
    image: taxImg,
    publishedAt: "2025-01-28",
    keywords: ["941-X", "payroll tax", "tax correction", "amended return", "employer taxes"]
  },
  {
    slug: "autofillpdf-vs-smallpdf",
    title: "AutoFillPDF vs SmallPDF: Which PDF Tool Is Right for You?",
    excerpt: "SmallPDF is an all-in-one toolkit with 20+ tools. AutoFillPDF specializes in form filling. Here's how to choose the right one.",
    category: "Comparisons",
    categorySlug: "features",
    categoryIcon: FileText,
    readTime: "10 min read",
    image: autofillImg,
    publishedAt: "2025-01-29",
    keywords: ["SmallPDF alternative", "PDF toolkit", "form filler", "PDF comparison", "best PDF tool"]
  },
  {
    slug: "form-1098-t-tuition-statement-guide",
    title: "Form 1098-T: Tuition Statement Guide for Students and Parents",
    excerpt: "Form 1098-T helps you claim education tax credits worth up to $2,500. Here's what students and parents need to know.",
    category: "Tax Forms",
    categorySlug: "tax",
    categoryIcon: Receipt,
    readTime: "10 min read",
    image: schoolImg,
    publishedAt: "2025-01-30",
    keywords: ["1098-T", "tuition statement", "education credit", "AOTC", "student taxes"]
  }
];

export const categories = [
  { value: "all", label: "All Posts", icon: FileText },
  { value: "how-to", label: "How-To Guides", icon: FileText },
  { value: "tax", label: "Tax Forms", icon: Receipt },
  { value: "government", label: "Government", icon: Landmark },
  { value: "real-estate", label: "Real Estate", icon: Home },
  { value: "features", label: "Comparisons", icon: FileText },
  { value: "hr", label: "HR & Employment", icon: Users },
];
