
export type LeaderboardRule = "FIRST" | "HIGHEST" | "LATEST";

type ScoredQuestion = {
  correctIndex: number;
  marks: number;
};

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
    } else if (answers[index] < 0 || answers[index] === undefined) {
      unansweredCount += 1;
    } else {
      wrongCount += 1;

      if (negativeMarkingEnabled) {
        negativeMarksDeducted += negativeMarks;
      }
    }
  });

  const scoreBeforeFloor = roundMarks(
    correctMarks - negativeMarksDeducted
  );

  return {
    totalMarks: roundMarks(
      questions.reduce((sum, question) => sum + question.marks, 0)
    ),
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
  getSubmittedAt: (
    result: T
  ) => Date | string | null | undefined
) {
  // Convert submission dates into timestamps safely.
  // Missing or invalid dates are treated as the latest possible time.
  const getTimestamp = (result: T): number => {
    const submittedAt = getSubmittedAt(result);

    if (!submittedAt) {
      return Number.MAX_SAFE_INTEGER;
    }

    const timestamp = new Date(submittedAt).getTime();

    return Number.isFinite(timestamp)
      ? timestamp
      : Number.MAX_SAFE_INTEGER;
  };

  // Select one result per student based on leaderboard rule.
  const selectedByStudent = new Map<string, T>();

  for (const result of results) {
    const studentId = getStudentId(result);
    const current = selectedByStudent.get(studentId);

    const useResult =
      !current ||
      (rule === "FIRST"
        ? getTimestamp(result) < getTimestamp(current)
        : rule === "LATEST"
          ? getTimestamp(result) > getTimestamp(current)
          : getScore(result) > getScore(current) ||
            (getScore(result) === getScore(current) &&
              getTimestamp(result) < getTimestamp(current)));

    if (useResult) {
      selectedByStudent.set(studentId, result);
    }
  }

  // Sort selected student results by score and submission time.
  const rankedResults = [...selectedByStudent.entries()].sort(
    ([, left], [, right]) => {
      const scoreDifference = getScore(right) - getScore(left);

      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      // Earlier submission wins when scores are equal.
      return getTimestamp(left) - getTimestamp(right);
    }
  );

  // Assign competition ranking:
  // 1, 1, 3 (students with equal scores share the same rank).
  let rank = 0;
  let previousScore: number | undefined;

  return rankedResults.map(([studentId, result], index) => {
    const score = getScore(result);

    if (score !== previousScore) {
      rank = index + 1;
    }

    previousScore = score;

    return {
      studentId,
      result,
      rank,
      rankTotal: rankedResults.length
    };
  });
}
