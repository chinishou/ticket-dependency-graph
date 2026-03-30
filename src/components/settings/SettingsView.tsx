import { useState, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import {
  DEFAULT_WEIGHTS,
  deriveWeightsFromCalibration,
  type CalibrationAnswer,
} from '../../utils/priorityCalc';
import type { CalibrationWeights } from '../../types';

// === Weight Sliders Section ===

function WeightSliders({
  weights,
  onChange,
}: {
  weights: CalibrationWeights;
  onChange: (w: CalibrationWeights) => void;
}) {
  const sliders: { key: keyof CalibrationWeights; label: string; color: string }[] = [
    { key: 'project', label: 'Project Priority', color: '#ef4444' },
    { key: 'dept', label: 'Department Priority', color: '#f59e0b' },
    { key: 'goal', label: 'Goal Priority', color: '#22c55e' },
    { key: 'creator', label: 'Creator Priority', color: '#8b5cf6' },
    { key: 'graph', label: 'Graph Factor', color: '#38bdf8' },
  ];

  const handleChange = (key: keyof CalibrationWeights, rawValue: number) => {
    const MIN = 0.05;
    const value = Math.max(MIN, Math.min(0.80, rawValue));

    // Adjust others proportionally to keep sum = 1
    const othersTotal = 1 - weights[key];
    const newOthersTotal = 1 - value;
    const updated = { ...weights, [key]: value };

    for (const s of sliders) {
      if (s.key !== key) {
        if (othersTotal > 0) {
          updated[s.key] = Math.max(MIN, (weights[s.key] / othersTotal) * newOthersTotal);
        }
      }
    }

    // Normalize to sum exactly to 1
    const sum = Object.values(updated).reduce((a, b) => a + b, 0);
    for (const s of sliders) {
      updated[s.key] = Math.round((updated[s.key] / sum) * 1000) / 1000;
    }

    onChange(updated);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {sliders.map(({ key, label, color }) => (
        <div key={key}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{label}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color }}>{Math.round(weights[key] * 100)}%</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="range"
              min={5}
              max={80}
              value={Math.round(weights[key] * 100)}
              onChange={(e) => handleChange(key, parseInt(e.target.value) / 100)}
              style={{
                flex: 1,
                accentColor: color,
                height: 6,
              }}
            />
          </div>
          <div
            style={{
              marginTop: 4,
              height: 4,
              borderRadius: 2,
              backgroundColor: 'var(--color-bg-tertiary)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${weights[key] * 100}%`,
                height: '100%',
                backgroundColor: color,
                borderRadius: 2,
                transition: 'width 0.15s',
              }}
            />
          </div>
        </div>
      ))}

      <div style={{
        marginTop: 8,
        padding: '8px 12px',
        borderRadius: 6,
        backgroundColor: 'var(--color-bg-tertiary)',
        fontSize: 12,
        color: 'var(--color-text-muted)',
        display: 'flex',
        justifyContent: 'space-between',
      }}>
        <span>Total</span>
        <span style={{ fontWeight: 600, color: 'var(--color-text-secondary)' }}>
          {Math.round(Object.values(weights).reduce((a, b) => a + b, 0) * 100)}%
        </span>
      </div>
    </div>
  );
}

// === Calibration Wizard ===

interface CalibrationQuestion {
  id: number;
  title: string;
  guide: string;
  scenario: string;
  optionA: string;
  optionB: string;
  impactNote: string;
  isGraphQuestion?: boolean;
  graphOptions?: { label: string; value: 'high' | 'medium' | 'low'; hint: string }[];
}

const CALIBRATION_QUESTIONS: CalibrationQuestion[] = [
  {
    id: 1,
    title: 'Creator Role vs Project Priority',
    guide: 'This determines how much weight a lead\'s judgment carries compared to the project\'s strategic priority level.',
    scenario: 'A lead creates a P3 ticket vs a non-lead creates a P1 ticket — which should be prioritized?',
    optionA: 'Lead\'s P3 ticket',
    optionB: 'Non-lead\'s P1 ticket',
    impactNote: 'A → Creator weight increases, Project weight decreases. B → Project weight increases, Creator weight decreases.',
  },
  {
    id: 2,
    title: 'Department vs Project Priority',
    guide: 'When department priority and project priority disagree, which should the system favor?',
    scenario: 'Dept P1 / Project P2 ticket vs Dept P2 / Project P1 ticket (same creator and graph) — which wins?',
    optionA: 'Dept P1 / Proj P2',
    optionB: 'Dept P2 / Proj P1',
    impactNote: 'A → Department weight increases. B → Project weight increases.',
  },
  {
    id: 3,
    title: 'Graph Topology vs Project Priority',
    guide: 'Should a lower-priority task that unblocks many others outrank a high-priority task with no dependents?',
    scenario: 'P3 ticket that blocks 12 downstream tasks vs P1 ticket with no downstream — which wins?',
    optionA: 'P3 (blocks 12 tasks)',
    optionB: 'P1 (no downstream)',
    impactNote: 'A → Graph weight increases significantly. B → Project priority creates a hard floor that graph cannot override.',
  },
  {
    id: 4,
    title: 'Creator Role vs Department Priority',
    guide: 'When a lead works on a low-priority department task, should their lead status boost it above a high-priority department task from a non-lead?',
    scenario: 'Lead\'s Dept P3 ticket vs non-lead\'s Dept P1 ticket (same project and graph) — which wins?',
    optionA: 'Lead\'s Dept P3',
    optionB: 'Non-lead\'s Dept P1',
    impactNote: 'A → Creator weight increases, Department weight decreases. B → Department weight increases, Creator weight decreases.',
  },
  {
    id: 5,
    title: 'Goal Priority vs Department Priority',
    guide: 'Goal priority (1-3) is set per goal within a department. When a high-priority goal sits in a low-priority department (or vice versa), which should win?',
    scenario: 'Goal priority 1 in Dept P3 vs Goal priority 3 in Dept P1 (same project, creator, and graph) — which wins?',
    optionA: 'Goal 1 / Dept P3',
    optionB: 'Goal 3 / Dept P1',
    impactNote: 'A → Goal weight increases, Department weight decreases. B → Department weight increases, Goal weight decreases.',
  },
  {
    id: 6,
    title: 'Goal Priority vs Project Priority',
    guide: 'When a top-priority goal belongs to a lower-priority project, should the goal\'s importance override the project level?',
    scenario: 'Goal priority 1 / Project P3 vs Goal priority 3 / Project P1 (same dept, creator, and graph) — which wins?',
    optionA: 'Goal 1 / Proj P3',
    optionB: 'Goal 3 / Proj P1',
    impactNote: 'A → Goal weight increases, Project weight decreases. B → Project weight increases, Goal weight decreases.',
  },
  {
    id: 7,
    title: 'Multi-Factor Tradeoff',
    guide: 'This tests how all five factors interact. One ticket has moderate scores across the board, the other has one strong factor but weak others.',
    scenario: 'P2/Dept P2/Goal 2/high-graph ticket vs P1/Dept P3/Goal 3/low-graph ticket — which wins?',
    optionA: 'P2 / Dept P2 / Goal 2 / High graph',
    optionB: 'P1 / Dept P3 / Goal 3 / Low graph',
    impactNote: 'A → Balanced weighting favoring graph, department, and goal. B → Project priority dominates other factors.',
  },
  {
    id: 8,
    title: 'Critical Path Importance',
    guide: 'The graph factor captures how many tasks depend on this one and whether it\'s on the critical path. How much should this matter overall?',
    scenario: 'Two identical tickets except one is on the critical path (GF=90) and the other isn\'t (GF=30) — how much should the graph/critical path matter?',
    optionA: '',
    optionB: '',
    impactNote: '',
    isGraphQuestion: true,
    graphOptions: [
      { label: 'Critical path always wins', value: 'high', hint: 'Graph factor gets ~40-50% of total weight' },
      { label: 'Somewhere in between', value: 'medium', hint: 'Graph factor stays at current weight (~30%)' },
      { label: 'Critical path is just a tiebreaker', value: 'low', hint: 'Graph factor drops to ~15-20% of total weight' },
    ],
  },
];

function CalibrationWizard({ onComplete }: { onComplete: (weights: CalibrationWeights) => void }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<CalibrationAnswer[]>([]);
  const [conflicts, setConflicts] = useState<string[]>([]);

  const question = CALIBRATION_QUESTIONS[currentStep];
  const isLastStep = currentStep === CALIBRATION_QUESTIONS.length - 1;

  const handleAnswer = (answer: CalibrationAnswer) => {
    const newAnswers = [...answers.filter(a => a.questionId !== answer.questionId), answer];
    setAnswers(newAnswers);

    if (isLastStep) {
      const result = deriveWeightsFromCalibration(newAnswers);
      setConflicts(result.conflicts);
      onComplete(result.weights);
    } else {
      setCurrentStep(currentStep + 1);
    }
  };

  const currentAnswer = answers.find(a => a.questionId === question?.id);

  if (!question) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Progress */}
      <div style={{ display: 'flex', gap: 4 }}>
        {CALIBRATION_QUESTIONS.map((_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              backgroundColor: i <= currentStep ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
              transition: 'background-color 0.2s',
              cursor: i < currentStep ? 'pointer' : 'default',
            }}
            onClick={() => { if (i < currentStep) setCurrentStep(i); }}
          />
        ))}
      </div>

      {/* Title & Guide */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            {currentStep + 1}/{CALIBRATION_QUESTIONS.length}
          </span>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>
            {question.title}
          </span>
        </div>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '0 0 12px', lineHeight: 1.5 }}>
          {question.guide}
        </p>
      </div>

      {/* Scenario */}
      <div style={{
        padding: '16px 20px',
        borderRadius: 8,
        backgroundColor: 'var(--color-bg-tertiary)',
        fontSize: 14,
        lineHeight: 1.6,
        color: 'var(--color-text-primary)',
      }}>
        {question.scenario}
      </div>

      {/* Options */}
      {question.isGraphQuestion ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {question.graphOptions!.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleAnswer({ questionId: question.id, graphImportance: opt.value })}
              style={{
                padding: '12px 16px',
                borderRadius: 8,
                border: currentAnswer?.graphImportance === opt.value
                  ? '2px solid var(--color-accent)'
                  : '1px solid var(--color-border)',
                backgroundColor: currentAnswer?.graphImportance === opt.value
                  ? 'rgba(56, 189, 248, 0.08)'
                  : 'var(--color-bg-secondary)',
                color: 'var(--color-text-primary)',
                fontSize: 13,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'border-color 0.15s, background-color 0.15s',
              }}
            >
              <div>{opt.label}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>{opt.hint}</div>
            </button>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 10 }}>
          {[
            { label: question.optionA, value: 'A' as const },
            { label: question.optionB, value: 'B' as const },
          ].map(({ label, value }) => (
            <button
              key={value}
              onClick={() => handleAnswer({ questionId: question.id, winner: value })}
              style={{
                flex: 1,
                padding: '14px 16px',
                borderRadius: 8,
                border: currentAnswer?.winner === value
                  ? '2px solid var(--color-accent)'
                  : '1px solid var(--color-border)',
                backgroundColor: currentAnswer?.winner === value
                  ? 'rgba(56, 189, 248, 0.08)'
                  : 'var(--color-bg-secondary)',
                color: 'var(--color-text-primary)',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'border-color 0.15s, background-color 0.15s',
              }}
            >
              {value}: {label}
            </button>
          ))}
        </div>
      )}

      {/* Impact note */}
      {question.impactNote && currentAnswer && (
        <div style={{
          padding: '8px 12px',
          borderRadius: 6,
          backgroundColor: 'rgba(56, 189, 248, 0.05)',
          border: '1px solid rgba(56, 189, 248, 0.15)',
          fontSize: 11,
          color: 'var(--color-text-muted)',
          lineHeight: 1.5,
        }}>
          <strong style={{ color: 'var(--color-text-secondary)' }}>Impact:</strong> {question.impactNote}
        </div>
      )}

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
        <button
          onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
          disabled={currentStep === 0}
          style={{
            padding: '6px 14px',
            borderRadius: 6,
            border: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-bg-tertiary)',
            color: currentStep === 0 ? 'var(--color-text-muted)' : 'var(--color-text-secondary)',
            fontSize: 12,
            cursor: currentStep === 0 ? 'default' : 'pointer',
          }}
        >
          Back
        </button>

        {!isLastStep && currentAnswer && (
          <button
            onClick={() => setCurrentStep(currentStep + 1)}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: 'none',
              backgroundColor: 'var(--color-accent)',
              color: '#0f172a',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Next
          </button>
        )}
      </div>

      {/* Conflicts */}
      {conflicts.length > 0 && (
        <div style={{
          padding: '10px 14px',
          borderRadius: 8,
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          fontSize: 12,
          color: '#ef4444',
        }}>
          <strong>Conflicts detected:</strong>
          {conflicts.map((c, i) => <div key={i} style={{ marginTop: 4 }}>{c}</div>)}
        </div>
      )}
    </div>
  );
}

// === Main Settings View ===

export function SettingsView() {
  const storeWeights = useStore((s) => s.calibrationWeights);
  const setCalibrationWeights = useStore((s) => s.setCalibrationWeights);
  const workersMap = useStore((s) => s.workers);
  const updateWorker = useStore((s) => s.updateWorker);

  const currentWeights = storeWeights && 'goal' in storeWeights ? storeWeights : DEFAULT_WEIGHTS;

  const [mode, setMode] = useState<'manual' | 'wizard'>('manual');
  const [localWeights, setLocalWeights] = useState<CalibrationWeights>(currentWeights);
  const [saved, setSaved] = useState(false);

  const isDefault = useMemo(() => {
    return localWeights.project === DEFAULT_WEIGHTS.project &&
      localWeights.dept === DEFAULT_WEIGHTS.dept &&
      localWeights.goal === DEFAULT_WEIGHTS.goal &&
      localWeights.creator === DEFAULT_WEIGHTS.creator &&
      localWeights.graph === DEFAULT_WEIGHTS.graph;
  }, [localWeights]);

  const [leadSearch, setLeadSearch] = useState('');

  const allWorkers = useMemo(() => {
    const list = Array.from(workersMap.values())
      .map((w) => ({ id: w.id, name: w.name, isLead: w.isLead ?? false }))
      .sort((a, b) => {
        if (a.isLead !== b.isLead) return a.isLead ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    if (!leadSearch.trim()) return list;
    const q = leadSearch.toLowerCase();
    return list.filter((w) => w.name.toLowerCase().includes(q));
  }, [workersMap, leadSearch]);

  const handleSave = () => {
    setCalibrationWeights(localWeights);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    setLocalWeights(DEFAULT_WEIGHTS);
    setCalibrationWeights(DEFAULT_WEIGHTS);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleWizardComplete = (weights: CalibrationWeights) => {
    setLocalWeights(weights);
    setMode('manual');
  };

  const sectionStyle: React.CSSProperties = {
    padding: '20px 24px',
    borderRadius: 10,
    backgroundColor: 'var(--color-bg-secondary)',
    border: '1px solid var(--color-border)',
  };

  const headingStyle: React.CSSProperties = {
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--color-text-primary)',
    marginBottom: 16,
  };

  return (
    <div style={{
      width: '100%',
      height: '100%',
      overflow: 'auto',
      padding: '24px 32px',
    }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
            Settings
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '4px 0 0' }}>
            Configure priority weights, lead list, and calibration
          </p>
        </div>

        {/* Priority Weights Section */}
        <div style={sectionStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={headingStyle}>Priority Weights</h2>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => setMode('manual')}
                style={{
                  padding: '4px 10px',
                  borderRadius: 4,
                  border: mode === 'manual' ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                  backgroundColor: mode === 'manual' ? 'rgba(56, 189, 248, 0.08)' : 'transparent',
                  color: mode === 'manual' ? 'var(--color-accent)' : 'var(--color-text-muted)',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                Manual
              </button>
              <button
                onClick={() => setMode('wizard')}
                style={{
                  padding: '4px 10px',
                  borderRadius: 4,
                  border: mode === 'wizard' ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                  backgroundColor: mode === 'wizard' ? 'rgba(56, 189, 248, 0.08)' : 'transparent',
                  color: mode === 'wizard' ? 'var(--color-accent)' : 'var(--color-text-muted)',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                Calibration Wizard
              </button>
            </div>
          </div>

          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '0 0 16px' }}>
            {mode === 'manual'
              ? 'Adjust sliders to set how much each factor contributes to the computed priority score. Weights must sum to 100%.'
              : 'Answer 8 scenario questions and the system will derive optimal weights from your preferences.'}
          </p>

          {mode === 'manual' ? (
            <WeightSliders weights={localWeights} onChange={setLocalWeights} />
          ) : (
            <CalibrationWizard onComplete={handleWizardComplete} />
          )}
        </div>

        {/* Actions */}
        <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            onClick={handleSave}
            style={{
              padding: '8px 20px',
              borderRadius: 6,
              border: 'none',
              backgroundColor: 'var(--color-accent)',
              color: '#0f172a',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {saved ? 'Saved!' : 'Save Weights'}
          </button>
          {!isDefault && (
            <button
              onClick={handleReset}
              style={{
                padding: '8px 20px',
                borderRadius: 6,
                border: '1px solid var(--color-border)',
                backgroundColor: 'transparent',
                color: 'var(--color-text-secondary)',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Reset to Defaults
            </button>
          )}
          {saved && (
            <span style={{ fontSize: 12, color: 'var(--color-done)' }}>
              Weights applied to all priority calculations
            </span>
          )}
        </div>

        {/* Lead List */}
        <div style={{ ...sectionStyle, marginTop: 20 }}>
          <h2 style={headingStyle}>Lead List</h2>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '0 0 12px' }}>
            Leads get a higher creator factor in priority calculations.
          </p>
          <input
            type="text"
            placeholder="Search workers..."
            value={leadSearch}
            onChange={(e) => setLeadSearch(e.target.value)}
            style={{
              width: '100%', padding: '7px 10px', borderRadius: 6,
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-bg-tertiary)',
              color: 'var(--color-text-primary)',
              fontSize: 12, outline: 'none', marginBottom: 12,
            }}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {allWorkers.map((w) => (
              <button
                key={w.id}
                onClick={() => updateWorker(w.id, { isLead: !w.isLead })}
                style={{
                  fontSize: 12, padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
                  border: w.isLead ? '1px solid #8b5cf6' : '1px solid var(--color-border)',
                  backgroundColor: w.isLead ? 'rgba(139, 92, 246, 0.15)' : 'transparent',
                  color: w.isLead ? '#8b5cf6' : 'var(--color-text-muted)',
                  fontWeight: w.isLead ? 600 : 400,
                }}
              >
                {w.name}
              </button>
            ))}
          </div>
        </div>

        {/* Formula Preview */}
        <div style={{ ...sectionStyle, marginTop: 20 }}>
          <h2 style={headingStyle}>Formula Preview</h2>
          <div style={{
            fontFamily: 'monospace',
            fontSize: 13,
            color: 'var(--color-text-secondary)',
            lineHeight: 1.8,
            padding: '12px 16px',
            borderRadius: 6,
            backgroundColor: 'var(--color-bg-primary)',
          }}>
            <div>ComputedScore =</div>
            <div style={{ paddingLeft: 16 }}>
              <span style={{ color: '#ef4444' }}>{Math.round(localWeights.project * 100)}%</span> x ProjectFactor (P1=100, P2=67, P3=33)
            </div>
            <div style={{ paddingLeft: 16 }}>
              + <span style={{ color: '#f59e0b' }}>{Math.round(localWeights.dept * 100)}%</span> x DeptFactor (P1=100, P2=67, P3=33)
            </div>
            <div style={{ paddingLeft: 16 }}>
              + <span style={{ color: '#22c55e' }}>{Math.round(localWeights.goal * 100)}%</span> x GoalFactor (1=100, 2=67, 3=33)
            </div>
            <div style={{ paddingLeft: 16 }}>
              + <span style={{ color: '#8b5cf6' }}>{Math.round(localWeights.creator * 100)}%</span> x CreatorFactor (lead=100, other=50)
            </div>
            <div style={{ paddingLeft: 16 }}>
              + <span style={{ color: '#38bdf8' }}>{Math.round(localWeights.graph * 100)}%</span> x GraphFactor (0-100, deps + critical path)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
