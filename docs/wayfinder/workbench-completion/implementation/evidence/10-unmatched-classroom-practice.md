# 10: Unmatched classroom practice recovery

Status: targeted implementation verified; actual installed classroom/model acceptance and the full ticket remain open.

The parent actual classroom flow selected a named knowledge point with no matching bank questions. The Host correctly refused broadening, but the practice view showed Preparing questions indefinitely because it used the absence of a round as a loading signal.

The practice UI now tracks actual preparation separately from shared practice command activity and retains a preparation-specific error. A completed failed request ends loading and shows the error inside This lesson practice. The user may explicitly retry the original conditions or choose Remove knowledge-point restriction and practise this subject. The latter removes only the new practice request filter, preserving subject, original classroom objective, restricted knowledge point and learner summary. It warns that the round is not automatically linked and that classroom linking still checks the original point. There is no automatic broadening, new classroom, completion, teaching send or model request.

A public classroom DOM test reproduced the loading defect (RED), then passed by verifying exactly one failed restricted request before the user's explicit broader gesture, exactly one subsequent same-subject request without the point, displayed question content, and unchanged original classroom request/summary. It does not claim real bank coverage or actual model teaching.

Verification: 2 targeted UI tests, 17 lesson/practice Host tests and Client type gate passed. The Host no-match rejection, grading, original lesson linkage and completion requirements are unchanged. No formal profile, parent browser/model, private materials or remote state was changed.

Installed acceptance: reopen the parent's failed restricted classroom practice, verify the stopped failure state and original-condition retry. Click the explicit subject retry and verify the new round is visibly broader while the original classroom remains intact. Do not claim that unrelated point questions satisfy the original restricted classroom; submission/linking/confirmation continue through the existing authoritative Host validation.
