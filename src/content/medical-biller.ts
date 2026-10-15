// SERVER ONLY — contains the answer key. Never import this from a "use client" file.
import type { AssessmentContent, Question } from "./types";

const L = ["a", "b", "c", "d", "e", "f"];
function q(n: number, prompt: string, options: string[], correctIndex: number): Question {
  return {
    id: `q${String(n).padStart(2, "0")}`,
    prompt,
    options: options.map((text, i) => ({ id: L[i], text })),
    answer: L[correctIndex],
  };
}

const PAYMENT_AMOUNTS = ["18.78", "228.00", "93.90", "134.10", "1.50", "73.62"];
const EOB_AMOUNTS = ["233.86", "185.19", "48.67", "76.33"];

export const medicalBiller: AssessmentContent = {
  slug: "medical-biller",
  intro: [
    "This assessment is designed to understand your strengths in Medical Billing and prepare you for the task at hand that comes with the role. By profiling your skills, we aim to provide you with role/s that will best utilize your abilities within the medical billing field.",
    "The session is timed at 30 minutes. Later sections contain a video and scenario-based images, so manage your time wisely.",
    "Your responses will help us determine the roles that align with your skills. The role(s) profiled to you based on your score will be subject to further assessment during Bootcamp Training, which you must also pass.",
    "If you have any questions or require assistance, please contact lead@mymountainmover.com.",
  ],
  sections: [
    {
      id: "insurance-verification",
      title: "Insurance Verification",
      description:
        "This part of the assessment will measure your ability to confirm patient eligibility, benefits, and authorization requirements before services are rendered.",
      stimuli: [{ type: "image", file: "eob-mediblue.png", caption: "EOB — use this for the questions in this section" }],
      questions: [
        q(1, "How much did the insurance company actually pay for CPT code 90836?", EOB_AMOUNTS, 2),
        q(2, "Where were the services rendered?", ["Inpatient Facility", "Doctor’s Office", "Urgent Care Facility", "Patient’s Home"], 2),
        q(
          3,
          "You found out that the EOB shows a contractual difference of $236.14. What does this amount represent?",
          [
            "Deductible balance the patient owes.",
            "Amount the provider must write off per insurance contract.",
            "Late fee charged by the payer.",
            "Patient balance after co-pays.",
          ],
          1,
        ),
        q(
          4,
          "Referring to the EOB image for CPT code 90836: The Allowed amount is $68.67 and the Co-Pay is $20.00. What is the correct calculated amount the insurance company paid?",
          EOB_AMOUNTS,
          2,
        ),
      ],
    },
    {
      id: "claims-processing",
      title: "Claims Processing",
      description:
        "This part of the assessment will measure your ability to review and prepare medical claims by verifying coding accuracy, ensuring necessary documentation, and checking for compliance with insurance requirements.",
      stimuli: [
        { type: "image", file: "superbill-1.png", caption: "Superbill #1" },
        { type: "image", file: "superbill-2.png", caption: "Superbill #2" },
      ],
      questions: [
        q(
          5,
          "You should confirm all of the following before claim submission EXCEPT:",
          [
            "If modifier 59 or 25 is needed to show distinct services",
            "If medical necessity supports both procedures for the same patient encounter",
            "If both procedures are supported by chart notes and time spent is documented",
            "If the patient’s insurance deductible is paid before sending the claim",
          ],
          3,
        ),
        q(
          6,
          "The superbill shows $530 in charges, but Block 24F totals $350. If you are the medical biller assigned to review this, what would you identify as the risk?",
          [
            "Claim underpays since charge is too low.",
            "Claim rejects since charges must match CPT volume.",
            "Claim delays but payer adjusts to allowed amount.",
            "Claim denies for missing modifier.",
          ],
          0,
        ),
        q(
          7,
          "A provider billed both 99213 (E/M visit) and 94010 (spirometry) on the same date. The superbill does not indicate any modifier use. What is the risk if the claim is submitted without a modifier?",
          [
            "The claim may deny because the E/M visit is bundled into the procedure.",
            "The claim will process without any issues since both codes are valid.",
            "The insurance will add the required modifier during processing.",
            "The claim will be rejected only if the patient has no active insurance.",
          ],
          0,
        ),
        q(
          8,
          "The superbill lists COPD (J44.9) but the provider also marked 94660 (CPAP initiation). What should be verified before submitting the claim?",
          [
            "Whether the patient’s address matches the payer’s records.",
            "Whether the claim is filed under the provider’s correct TIN.",
            "Whether COPD supports medical necessity for CPAP initiation.",
            "Whether the billed charges equal the allowed amount.",
          ],
          2,
        ),
        // DRAFT KEY — confirm with the official answer key.
        q(
          9,
          "The superbill total is $530. To ensure compliance, you should check all of the following EXCEPT:",
          [
            "ICD-10 diagnosis codes are valid and active for the date of service",
            "CPT codes billed are not bundled or mutually exclusive without modifiers",
            "The billed charges match the payer’s maximum allowable fees",
            "The patient signed the superbill at the time of service",
          ],
          2,
        ),
      ],
    },
    {
      id: "claims-submission",
      title: "Claims Submission",
      description:
        "This part of the assessment will measure your ability to submit claims to insurance companies electronically or by paper, ensuring timely and accurate delivery based on payer guidelines. Analyze the claim form together with the superbills above and the patient’s ID card.",
      stimuli: [
        { type: "image", file: "cms-1500.png", caption: "CMS-1500 claim form" },
        { type: "image", file: "member-id-front.png", caption: "Member ID (front)" },
        { type: "image", file: "member-id-back.png", caption: "Member ID (back)" },
        { type: "image", file: "superbill-1.png", caption: "Superbill #1" },
        { type: "image", file: "superbill-2.png", caption: "Superbill #2" },
      ],
      questions: [
        q(
          10,
          "Edward Colins has Aetna POS II as primary and Medicare Part B as secondary. The CMS-1500 was submitted with Aetna marked in Block 1, but no secondary insurance listed in Block 9–9d. What is the most likely outcome?",
          [
            "Aetna processes claim, but secondary benefits are never triggered.",
            "Claim auto-denies since Medicare was omitted.",
            "Claim is routed directly to Medicare after Aetna pays.",
            "Claim pays in full under Aetna without secondary review.",
          ],
          0,
        ),
        q(
          11,
          "Your clearinghouse rejects the claim with the error “Loop 2310B: Rendering Provider not enrolled with payer.” The superbill shows Dr. Jimmy Chu was the rendering provider. What should be verified first?",
          [
            "Dr. Chu’s credentialing status with Aetna.",
            "Whether the group NPI is active with Medicare.",
            "Whether CPT codes are valid for DOS.",
            "Whether the patient’s DOB matches ID card.",
          ],
          0,
        ),
        q(
          12,
          "Superbill shows J44.9 (COPD). Claim also lists F17.210 (nicotine dependence). Payer denies CPT 94010 (spirometry) as not medically necessary with nicotine dependence. What’s the correct action?",
          [
            "Ensure spirometry is linked only to J44.9 in Block 24E.",
            "Delete nicotine dependence code entirely.",
            "Bill spirometry with modifier 59.",
            "Appeal citing COPD as underlying cause.",
          ],
          0,
        ),
        q(
          13,
          "Patient had office visit + spirometry on 06/01/24, and nebulizer treatment on 06/05/24. Biller mistakenly combined all CPTs on one DOS (06/01/24). What’s the correct fix?",
          [
            "Submit corrected claims splitting services by actual DOS.",
            "Let claim process since CPTs are valid.",
            "Bill both DOS as 06/05/24.",
            "Appeal for partial payment.",
          ],
          0,
        ),
        q(
          14,
          "Edward Collins is submitting a claim for services performed by Dr. Jimmy Chu and Dr. Stanley Cooper. Dr. Chu performed the procedure, while Dr. Cooper is listed as the billing provider. On the CMS-1500 claim form, where should the NPI of the physician who actually performed the service be entered?",
          [
            "Block 33 (Billing Provider NPI)",
            "Block 32 (Service Facility NPI)",
            "Block 24J (for each line item related to those services)",
            "Block 17 (Referring Provider NPI)",
          ],
          2,
        ),
      ],
    },
    {
      id: "account-management",
      title: "Account Management",
      description:
        "This part of the assessment will test your knowledge of maintaining accurate patient billing records, tracking outstanding balances, and initiating collections or payment plans.",
      stimuli: [{ type: "image", file: "eft-slip-detail.png", caption: "EFT deposit — use this for the questions in this section" }],
      questions: [
        q(
          15,
          "A patient’s account shows an outstanding balance of $50.05, but you just received an EFT deposit of $0.05. The patient already has a monthly payment plan of $25. What is the correct next step?",
          [
            "Write off the balance since a payment was made.",
            "Hold the $0.05 until the payer clarifies.",
            "Apply the $0.05, continue to monitor the $50, and keep the plan active.",
            "Refund the $0.05 to the patient immediately.",
          ],
          2,
        ),
        q(
          16,
          "A patient owes $150.05, but only $0.05 was received from the payer. The patient has ignored statements for 90+ days. What action should you take?",
          [
            "Close the balance since a payment was posted.",
            "Bill the patient for the $150 and prepare for collections.",
            "Refund the $0.05 since it does not match the claim.",
            "Remove the balance to avoid carrying bad debt.",
          ],
          1,
        ),
        q(
          17,
          "The ABA number 321171184 appears on the slip, but the clearinghouse reconciliation report shows an unmatched routing number for this deposit. What should an experienced biller do first?",
          [
            "Adjust the deposit to the practice’s suspense account until resolved.",
            "Post the payment manually and reconcile later.",
            "Validate bank routing/ABA with the financial institution and payer EFT enrollment.",
            "Return the payment to payer immediately.",
          ],
          2,
        ),
        q(
          18,
          "An internal audit reveals a recurring problem: several Electronic Funds Transfers (EFTs) from a specific payer were incorrectly applied to the wrong patient or general ledger accounts, all stemming from the account number ending in 7685. Your manager asks you to suggest a simple, effective systemic fix to prevent this costly error from happening again. What systemic fix should be implemented?",
          [
            "Configure the Practice Management System to use the payer's EFT account number (7685) as a key identifier, linking it to the specific general ledger or provider NPI account.",
            "Configure the Practice Management System to use the payer's EFT account number (7685) as a key identifier, no need to link it to the specific general ledger or provider NPI account since it can stand alone.",
            "Misstated AR aging causes the EFT account number to be applied incorrectly. This should be corrected.",
            "Denials cause the EFT account number to be applied correctly. This should be corrected.",
          ],
          0,
        ),
      ],
    },
    {
      id: "billing-inquiries",
      title: "Billing Inquiries",
      description:
        "This part of the assessment will test your ability to respond to patient and payer questions regarding charges, statements, balances, and coverage in a professional and timely manner.",
      stimuli: [{ type: "image", file: "anthem-eft.png", caption: "Anthem EFT payment — use this for the questions in this section" }],
      questions: [
        q(19, "The payment has been deposited electronically to which account number?", ["3190308662", "Account ending 7685", "Account ending 3943", "506814606"], 1),
        q(
          20,
          "A patient calls asking why they see a deposit from Anthem Blue Cross but do not understand what it represents. What should you explain?",
          [
            "This is a provider payment for services billed, not a patient refund.",
            "This is a direct refund to the patient for an overpayment.",
            "This is a tax-related statement, not a payment.",
            "This is an insurance premium payment.",
          ],
          0,
        ),
        q(
          21,
          "An Anthem representative calls asking why their EFT payment of $0.05 (EFT #123456789123T) has not been fully applied to a patient account. What is the most appropriate response?",
          [
            "The deposit was ignored since it was too small.",
            "The payment was deleted because it did not match.",
            "It was placed in unapplied cash while awaiting clarification.",
            "It was posted to the oldest outstanding balance.",
          ],
          2,
        ),
        q(
          22,
          "A patient at My Mountain Mover Clinic receives a bill for $150 but points out that the payer sent a payment of $0.05 (from the image). They argue their balance should be lower. What should you explain?",
          [
            "The $0.05 was applied, but the $150 balance remains due.",
            "The system is wrong, and the patient should wait for a new bill.",
            "The $0.05 payment clears the account entirely.",
            "The balance was waived because of the payment.",
          ],
          0,
        ),
      ],
    },
    {
      id: "payment-posting",
      title: "Payment Posting",
      description:
        "This part of the assessment will measure your ability to correctly post insurance and patient payments into the billing system, reconcile Explanation of Benefits (EOBs), and resolve payment discrepancies.",
      stimuli: [{ type: "image", file: "eob-careoregon.png", caption: "EOB and explanation codes — use this for the questions in this section" }],
      questions: [
        q(23, "How much is the sequestration amount?", PAYMENT_AMOUNTS, 4),
        q(
          24,
          "The EOB shows explanation code 45 (charges exceed fee schedule/maximum allowable) applied to CPT code 99213. What amount should you record as the contractual adjustment?",
          PAYMENT_AMOUNTS,
          3,
        ),
        q(
          25,
          "After all adjustments and patient responsibility are applied, you need to record the actual amount the payer reimbursed. How much should you post as the insurance payment?",
          PAYMENT_AMOUNTS,
          5,
        ),
        q(
          26,
          "You are reviewing the EOB for claim #888777111. CPT code 14301 was billed for $6,747.00, but the insurance denied the entire amount. The denial codes listed are 197 (no authorization) and 59 (bundled service). What is the denial reason for CPT code 14301?",
          [
            "Sequestration reduction",
            "Missing authorization and bundled service",
            "Global period edit",
            "Patient out-of-pocket exceeded",
            "None of the above",
          ],
          1,
        ),
      ],
    },
    {
      id: "denial-management",
      title: "Denial Management",
      description:
        "This part of the assessment will measure your ability to investigate denied claims, identify the reason codes, and take appropriate action to recover reimbursement. Watch the video before answering.",
      stimuli: [{ type: "video", file: "appeal-scenario-1.mp4", caption: "Appeal Scenario" }],
      questions: [
        q(
          27,
          "The payer confirmed that retro authorization is not allowed for the patient’s claim. What is the correct next step for the clinic?",
          ["File an appeal for the denied claim.", "Request retro authorization.", "Bill the patient for the full balance.", "Close the claim with no action."],
          0,
        ),
        q(
          28,
          "When submitting a retro authorization request, you need to ensure the payer has the correct information to evaluate it. Which detail is most critical to include in the appeal submission?",
          [
            "The provider’s NPI and tax ID number",
            "The CPT code and place of service",
            "The date of service and explanation for lack of prior auth",
            "The patient’s insurance ID and contact information",
          ],
          2,
        ),
        q(
          29,
          "The billed amount was $1,500.00, but the payer denied the service due to no prior authorization. What is the financial impact if the clinic fails to appeal?",
          [
            "$1,500.00 written off as contractual adjustment.",
            "$1,500.00 shifted to patient responsibility.",
            "$1,500.00 lost revenue unless appealed successfully.",
            "$1,500.00 automatically reprocessed by payer.",
          ],
          2,
        ),
        q(
          30,
          "The payer gave claim number EW33344. Another biller mistakenly wrote it down as EW33443 in the system. What risk does this error create for the appeal process?",
          [
            "The claim may not be traceable, delaying the appeal decision.",
            "The payer will automatically correct it during processing.",
            "The patient will receive the denial letter.",
            "It will result in duplicate payment for the claim.",
          ],
          0,
        ),
      ],
    },
  ],
};
