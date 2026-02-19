'use client';

import { Check, Circle, Lock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Step {
  id: string;
  title: string;
  description: string;
  status: 'completed' | 'current' | 'upcoming' | 'locked';
  optional?: boolean;
}

interface ProgressTrackerProps {
  steps: Step[];
  currentStepId: string;
  variant?: 'vertical' | 'horizontal';
  showDescription?: boolean;
}

export function ProgressTracker({
  steps,
  currentStepId,
  variant = 'vertical',
  showDescription = true,
}: ProgressTrackerProps) {
  const currentStepIndex = steps.findIndex((step) => step.id === currentStepId);
  const completedSteps = steps.filter((step) => step.status === 'completed').length;
  const totalSteps = steps.length;
  const progressPercentage = (completedSteps / totalSteps) * 100;

  if (variant === 'horizontal') {
    return (
      <div className="w-full">
        {/* Progress Bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="font-medium">Setup Progress</span>
            <span className="text-muted-foreground">
              {completedSteps} of {totalSteps} completed
            </span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-500 ease-out"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>

        {/* Steps */}
        <div className="flex items-start justify-between gap-2">
          {steps.map((step, index) => {
            const isCompleted = step.status === 'completed';
            const isCurrent = step.status === 'current';
            const isLocked = step.status === 'locked';

            return (
              <div key={step.id} className="flex-1 min-w-0">
                <div className="flex flex-col items-center text-center">
                  {/* Step Circle */}
                  <div
                    className={`h-10 w-10 rounded-full flex items-center justify-center mb-2 transition-all ${
                      isCompleted
                        ? 'bg-primary text-primary-foreground'
                        : isCurrent
                        ? 'bg-primary/20 text-primary border-2 border-primary'
                        : isLocked
                        ? 'bg-gray-100 text-gray-400'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {isCompleted ? (
                      <Check className="h-5 w-5" />
                    ) : isLocked ? (
                      <Lock className="h-4 w-4" />
                    ) : (
                      <span className="text-sm font-semibold">{index + 1}</span>
                    )}
                  </div>

                  {/* Step Title */}
                  <div
                    className={`text-sm font-medium mb-1 ${
                      isCurrent ? 'text-primary' : 'text-muted-foreground'
                    }`}
                  >
                    {step.title}
                  </div>

                  {/* Optional Badge */}
                  {step.optional && (
                    <Badge variant="outline" className="text-xs">
                      Optional
                    </Badge>
                  )}
                </div>

                {/* Connector Line */}
                {index < steps.length - 1 && (
                  <div className="relative -mt-6 mx-auto" style={{ width: 'calc(100% - 2rem)' }}>
                    <div
                      className={`h-0.5 ${
                        steps[index + 1].status === 'completed' ? 'bg-primary' : 'bg-gray-200'
                      }`}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Vertical variant
  return (
    <Card className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-2">Setup Progress</h3>
        <div className="flex items-center justify-between text-sm text-muted-foreground mb-3">
          <span>
            {completedSteps} of {totalSteps} steps completed
          </span>
          <span>{Math.round(progressPercentage)}%</span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-4">
        {steps.map((step, index) => {
          const isCompleted = step.status === 'completed';
          const isCurrent = step.status === 'current';
          const isLocked = step.status === 'locked';
          const isLast = index === steps.length - 1;

          return (
            <div key={step.id} className="relative">
              {/* Connector Line */}
              {!isLast && (
                <div
                  className={`absolute left-5 top-12 bottom-0 w-0.5 -mb-4 ${
                    isCompleted ? 'bg-primary' : 'bg-gray-200'
                  }`}
                />
              )}

              {/* Step Content */}
              <div className="flex gap-4">
                {/* Step Circle */}
                <div
                  className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 transition-all ${
                    isCompleted
                      ? 'bg-primary text-primary-foreground shadow-md'
                      : isCurrent
                      ? 'bg-primary/20 text-primary border-2 border-primary shadow-sm'
                      : isLocked
                      ? 'bg-gray-100 text-gray-400'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {isCompleted ? (
                    <Check className="h-5 w-5" />
                  ) : isLocked ? (
                    <Lock className="h-4 w-4" />
                  ) : (
                    <span className="text-sm font-semibold">{index + 1}</span>
                  )}
                </div>

                {/* Step Details */}
                <div className="flex-1 pb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <h4
                      className={`font-semibold ${
                        isCurrent ? 'text-primary' : isCompleted ? '' : 'text-muted-foreground'
                      }`}
                    >
                      {step.title}
                    </h4>
                    {step.optional && (
                      <Badge variant="outline" className="text-xs">
                        Optional
                      </Badge>
                    )}
                    {isCompleted && (
                      <Badge variant="default" className="text-xs">
                        Completed
                      </Badge>
                    )}
                    {isCurrent && (
                      <Badge variant="secondary" className="text-xs">
                        Current
                      </Badge>
                    )}
                  </div>

                  {showDescription && (
                    <p
                      className={`text-sm ${
                        isCurrent ? 'text-foreground' : 'text-muted-foreground'
                      }`}
                    >
                      {step.description}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Completion Message */}
      {progressPercentage === 100 && (
        <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center gap-2 text-green-700">
            <Check className="h-5 w-5" />
            <span className="font-semibold">Setup Complete!</span>
          </div>
          <p className="text-sm text-green-600 mt-1">
            You're all set to start exploring listings and finding your perfect home.
          </p>
        </div>
      )}
    </Card>
  );
}
