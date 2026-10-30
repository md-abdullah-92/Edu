export type LeaderboardRule = "FIRST" | "HIGHEST" | "LATEST";

type ScoredQuestion = { correctIndex: number; marks: number };

function roundMarks(value: number) {
  return Number(value.toFixed(2));
}

export function calculateExamScore(
  questions: ScoredQuestion[],
  answers: number[],
  negativeMarkingEnabled: boolean,
  negativeMarks: number
) {
  let correctMarks = 0;
  let negativeMarksDeducted = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let unansweredCount = 0;

  questions.forEach((question, index) => {
    if (answers[index] === question.correctIndex) {
      correctMarks += question.marks;
      correctCount += 1;
    } else if (answers[index] < 0) {
      unansweredCount += 1;
    } else {
      wrongCount += 1;
      if (negativeMarkingEnabled) negativeMarksDeducted += negativeMarks;
    }
  });

  const scoreBeforeFloor = roundMarks(correctMarks - negativeMarksDeducted);
  return {
    totalMarks: roundMarks(questions.reduce((sum, question) => sum + question.marks, 0)),
    correctMarks: roundMarks(correctMarks),
    negativeMarksDeducted: roundMarks(negativeMarksDeducted),
    score: Math.max(0, scoreBeforeFloor),
    scoreFloorApplied: scoreBeforeFloor < 0,
    correctCount,
    wrongCount,
    unansweredCount
  };
}

export function rankExamResults<T>(
  results: T[],
  rule: LeaderboardRule,
  getStudentId: (result: T) => string,
  getScore: (result: T) => number,
  getSubmittedAt: (result: T) => Date
) {
  const selectedByStudent = new Map<string, T>();
  for (const result of results) {
    const studentId = getStudentId(result);
    const current = selectedByStudent.get(studentId);
    const useResult = !current || (rule === "FIRST"
      ? getSubmittedAt(result) < getSubmittedAt(current)
      : rule === "LATEST"
        ? getSubmittedAt(result) > getSubmittedAt(current)
        : getScore(result) > getScore(current) || (getScore(result) === getScore(current) && getSubmittedAt(result) < getSubmittedAt(current)));
    if (useResult) selectedByStudent.set(studentId, result);
  }

  let rank = 0;
  let previousScore: number | undefined;
  return [...selectedByStudent.entries()]
    .sort(([, left], [, right]) => getScore(right) - getScore(left) || getSubmittedAt(left).valueOf() - getSubmittedAt(right).valueOf())
    .map(([studentId, result], index, ranked) => {
      const score = getScore(result);
      if (score !== previousScore) rank = index + 1;
      previousScore = score;
      return { studentId, result, rank, rankTotal: ranked.length };
    });
}
