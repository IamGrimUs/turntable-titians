// Mock data store - replace with database later
const battles: any[] = [];
const submissions: any[] = [];
const votes: any[] = [];
let battleIdCounter = 1;
let submissionIdCounter = 1;
let voteIdCounter = 1;

export const resolvers = {
  Query: {
    battles: () => battles,
    battle: (_, { id }) => battles.find((b) => b.id === id) || null,
    submission: (_, { id }) => submissions.find((s) => s.id === id) || null,
    submissions: (_, { battleId }) =>
      submissions.filter((s) => s.battleId === battleId),
    user: () => null, // TODO: Implement user lookup
    health: () => ({
      status: 'ok',
      message: 'Turntable Titans GraphQL API is running',
    }),
  },
  Mutation: {
    createBattle: (_, { title, description, startDate, endDate }) => {
      const battle = {
        id: String(battleIdCounter++),
        title,
        description: description || null,
        startDate,
        endDate,
        status: 'UPCOMING' as const,
        submissions: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      battles.push(battle);
      return battle;
    },
    createSubmission: (_, { battleId, userId, videoUrl, title, description }) => {
      const submission = {
        id: String(submissionIdCounter++),
        battleId,
        userId,
        videoUrl,
        title: title || null,
        description: description || null,
        votes: [],
        voteCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      submissions.push(submission);
      return submission;
    },
    vote: (_, { submissionId, userId }) => {
      // Check if user already voted for this submission
      const existingVote = votes.find(
        (v) => v.submissionId === submissionId && v.userId === userId
      );
      if (existingVote) {
        throw new Error('User has already voted for this submission');
      }

      const vote = {
        id: String(voteIdCounter++),
        submissionId,
        userId,
        createdAt: new Date().toISOString(),
      };
      votes.push(vote);

      // Update submission vote count
      const submission = submissions.find((s) => s.id === submissionId);
      if (submission) {
        submission.voteCount = votes.filter((v) => v.submissionId === submissionId).length;
      }

      return vote;
    },
    deleteVote: (_, { submissionId, userId }) => {
      const voteIndex = votes.findIndex(
        (v) => v.submissionId === submissionId && v.userId === userId
      );
      if (voteIndex === -1) {
        return false;
      }
      votes.splice(voteIndex, 1);

      // Update submission vote count
      const submission = submissions.find((s) => s.id === submissionId);
      if (submission) {
        submission.voteCount = votes.filter((v) => v.submissionId === submissionId).length;
      }

      return true;
    },
  },
  Battle: {
    submissions: (parent) =>
      submissions.filter((s) => s.battleId === parent.id),
  },
  Submission: {
    votes: (parent) => votes.filter((v) => v.submissionId === parent.id),
    voteCount: (parent) =>
      votes.filter((v) => v.submissionId === parent.id).length,
  },
};

