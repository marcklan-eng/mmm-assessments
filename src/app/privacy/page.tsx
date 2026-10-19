import TopBar from "@/components/TopBar";

export const metadata = { title: "Privacy | My Mountain Mover Skills Evaluation Assessment (SEA)" };

export default function Privacy() {
  return (
    <>
      <TopBar />
      <main className="wrap">
        <h1>Privacy notice</h1>
        <div className="card">
          <p>
            This site is used by My Mountain Mover Inc. to run skills assessments for job candidates. This notice explains what we
            collect when you take an assessment.
          </p>
          <h3>What we collect</h3>
          <ul className="clean">
            <li>Your name and email address, from the Google or Microsoft account you sign in with.</li>
            <li>Your answers, score, and the start and submit times of your assessment.</li>
            <li>Activity during the assessment, such as leaving the assessment window or exiting fullscreen.</li>
          </ul>
          <h3>How we use it</h3>
          <p>
            Only to evaluate your application, to apply our retake policy, and to improve our assessments. Results are visible to
            our evaluation team only. We don’t sell your information or use it for advertising.
          </p>
          <h3>Sign-in</h3>
          <p>
            We use Google or Microsoft sign-in only to confirm your name and email address. We don’t get your password or access to
            your email, files or contacts.
          </p>
          <h3>Contact</h3>
          <p>Questions or requests to delete your data: lead@mymountainmover.com</p>
        </div>
      </main>
    </>
  );
}
