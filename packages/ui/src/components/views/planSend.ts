export type PlanSendAction = 'improve' | 'implement';

export const getPlanSendVisiblePromptId = (action: PlanSendAction) =>
  action === 'improve' ? 'plan.improve.visible' : 'plan.implement.visible';

export const getPlanSendInstructionsPromptId = (action: PlanSendAction) =>
  action === 'improve' ? 'plan.improve.instructions' : 'plan.implement.instructions';

export const buildPlanSendPromptVariables = ({
  action,
  title,
  path,
  body,
}: {
  action: PlanSendAction;
  title: string;
  path: string;
  body: string;
}) => ({
  plan_title: title,
  plan_path: path,
  ...(action === 'implement' ? { plan_body: body } : {}),
});

export const getPlanSendPlanMode = (action: PlanSendAction): boolean | undefined =>
  action === 'implement' ? false : undefined;
