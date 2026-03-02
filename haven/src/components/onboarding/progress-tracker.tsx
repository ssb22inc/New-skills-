import { Check } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface Step {
  id: string;
  name: string;
  description?: string;
}

interface ProgressTrackerProps {
  steps: Step[];
  currentStep: number;
  onStepClick?: (index: number) => void;
}

export function ProgressTracker({ steps, currentStep, onStepClick }: ProgressTrackerProps) {
  return (
    <nav aria-label="Progress">
      <ol className="space-y-4 md:flex md:space-x-8 md:space-y-0">
        {steps.map((step, index) => {
          const isComplete = index < currentStep;
          const isCurrent = index === currentStep;

          return (
            <li key={step.id} className="md:flex-1">
              <button
                onClick={() => onStepClick?.(index)}
                disabled={index > currentStep}
                className={cn(
                  'group flex w-full flex-col border-l-4 py-2 pl-4 md:border-l-0 md:border-t-4 md:pb-0 md:pl-0 md:pt-4',
                  isComplete && 'border-blue-600',
                  isCurrent && 'border-blue-600',
                  !isComplete && !isCurrent && 'border-gray-200',
                  index <= currentStep && 'cursor-pointer'
                )}
              >
                <span className="flex items-center gap-2">
                  {isComplete ? (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white">
                      <Check className="h-4 w-4" />
                    </span>
                  ) : (
                    <span
                      className={cn(
                        'flex h-6 w-6 items-center justify-center rounded-full border-2 text-sm font-medium',
                        isCurrent
                          ? 'border-blue-600 text-blue-600'
                          : 'border-gray-300 text-gray-500'
                      )}
                    >
                      {index + 1}
                    </span>
                  )}
                  <span
                    className={cn(
                      'text-sm font-medium',
                      isComplete || isCurrent ? 'text-blue-600' : 'text-gray-500'
                    )}
                  >
                    {step.name}
                  </span>
                </span>
                {step.description && (
                  <span className="ml-8 text-sm text-gray-500 hidden md:block">
                    {step.description}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
