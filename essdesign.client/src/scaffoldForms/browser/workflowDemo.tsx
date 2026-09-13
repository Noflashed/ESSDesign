// Keep the shared mobile screen interface without loading tutorial animations on web.
type WorkflowDemoProps = {
  visible: boolean;
  variant: 'handover' | 'day-labour' | 'pre-start';
  formNumber?: string;
  referenceName?: string;
  representativeName?: string;
  showDontShowAgain?: boolean;
  onDontShowAgain?: () => void;
  onClose: () => void;
};

export default function ProjectDataFormDemoModal(_props: WorkflowDemoProps) {
  return null;
}

export async function shouldShowProjectDataWorkflowDemo(_userId: string): Promise<boolean> {
  return false;
}

export async function hideProjectDataWorkflowDemo(_userId: string): Promise<void> {
  // No tutorial preference is needed on web.
}
