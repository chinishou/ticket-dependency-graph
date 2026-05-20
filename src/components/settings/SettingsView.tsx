import { useState, useMemo, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { SettingsSgSync } from './SettingsSgSync';
import { SgStatusMap } from './SgStatusMap';
import { SgStatusMapInbound } from './SgStatusMapInbound';
import { LogViewer } from './LogViewer';
import {
  DEFAULT_WEIGHTS,
  deriveWeightsFromCalibration,
  type CalibrationAnswer,
} from '../../utils/priorityCalc';
import type { CalibrationWeights, UserRole } from '../../types';

// === Shared Styles ===

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

// === Tab System ===

type SettingsTab = 'priority' | 'roles' | 'sg' | 'logs';

function TabBar({ active, onChange }: { active: SettingsTab; onChange: (t: SettingsTab) => void }) {
  const tabs: { id: SettingsTab; label: string }[] = [
    { id: 'priority', label: 'Priority' },
    { id: 'roles', label: 'Role Management' },
    { id: 'sg', label: 'SG Import' },
    { id: 'logs', label: 'Logs' },
  ];

  return (
    <div style={{
      display: 'flex',
      gap: 4,
      padding: '4px',
      borderRadius: 8,
      backgroundColor: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      marginBottom: 20,
    }}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          style={{
            flex: 1,
            padding: '8px 16px',
            borderRadius: 6,
            border: 'none',
            backgroundColor: active === tab.id ? 'var(--color-accent)' : 'transparent',
            color: active === tab.id ? '#0f172a' : 'var(--color-text-muted)',
            fontSize: 13,
            fontWeight: active === tab.id ? 600 : 400,
            cursor: 'pointer',
            transition: 'background-color 0.15s, color 0.15s',
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// === Priority Tab ===

// --- Weight Sliders ---
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
              style={{ flex: 1, accentColor: color, height: 6 }}
            />
          </div>
          <div style={{
            marginTop: 4,
            height: 4,
            borderRadius: 2,
            backgroundColor: 'var(--color-bg-tertiary)',
            overflow: 'hidden',
          }}>
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

// --- Priority Wizard Modal ---
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
    guide: "This determines how much weight a lead's judgment carries compared to the project's strategic priority level.",
    scenario: 'A lead creates a P3 ticket vs a non-lead creates a P1 ticket — which should be prioritized?',
    optionA: "Lead's P3 ticket",
    optionB: "Non-lead's P1 ticket",
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
    guide: "When a lead works on a low-priority department task, should their lead status boost it above a high-priority department task from a non-lead?",
    scenario: "Lead's Dept P3 ticket vs non-lead's Dept P1 ticket (same project and graph) — which wins?",
    optionA: "Lead's Dept P3",
    optionB: "Non-lead's Dept P1",
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
    guide: "When a top-priority goal belongs to a lower-priority project, should the goal's importance override the project level?",
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
    guide: "The graph factor captures how many tasks depend on this one and whether it's on the critical path. How much should this matter overall?",
    scenario: "Two identical tickets except one is on the critical path (GF=90) and the other isn't (GF=30) — how much should the graph/critical path matter?",
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

function PriorityWizardModal({
  onComplete,
  onClose,
}: {
  onComplete: (weights: CalibrationWeights) => void;
  onClose: () => void;
}) {
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

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        backgroundColor: 'var(--color-bg-secondary)',
        borderRadius: 12,
        border: '1px solid var(--color-border)',
        padding: 24,
        width: '90%',
        maxWidth: 560,
        maxHeight: '90vh',
        overflow: 'auto',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
            Priority Weight Wizard
          </h2>
          <button
            onClick={onClose}
            style={{
              padding: '4px 10px',
              borderRadius: 4,
              border: '1px solid var(--color-border)',
              backgroundColor: 'transparent',
              color: 'var(--color-text-muted)',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>

        {/* Progress */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
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
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              {currentStep + 1}/{CALIBRATION_QUESTIONS.length}
            </span>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>
              {question.title}
            </span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.5 }}>
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
          marginBottom: 16,
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
            marginTop: 12,
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
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
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
            marginTop: 16,
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
    </div>
  );
}

// --- Lead List ---
function LeadList() {
  const workersMap = useStore((s) => s.workers);
  const updateWorker = useStore((s) => s.updateWorker);
  const [leadSearch, setLeadSearch] = useState('');

  const allWorkers = useMemo(() => {
    const list = Array.from(workersMap.values())
      .map((w) => ({ id: w.id, name: w.name ?? '', isLead: w.isLead ?? false }))
      .sort((a, b) => {
        if (a.isLead !== b.isLead) return a.isLead ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    if (!leadSearch.trim()) return list;
    const q = leadSearch.toLowerCase();
    return list.filter((w) => w.name.toLowerCase().includes(q));
  }, [workersMap, leadSearch]);

  return (
    <div style={sectionStyle}>
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
  );
}

// --- Formula Preview ---
function FormulaPreview({ weights }: { weights: CalibrationWeights }) {
  return (
    <div style={sectionStyle}>
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
          <span style={{ color: '#ef4444' }}>{Math.round(weights.project * 100)}%</span> x ProjectFactor (P1=100, P2=67, P3=33)
        </div>
        <div style={{ paddingLeft: 16 }}>
          + <span style={{ color: '#f59e0b' }}>{Math.round(weights.dept * 100)}%</span> x DeptFactor (P1=100, P2=67, P3=33)
        </div>
        <div style={{ paddingLeft: 16 }}>
          + <span style={{ color: '#22c55e' }}>{Math.round(weights.goal * 100)}%</span> x GoalFactor (1=100, 2=67, 3=33)
        </div>
        <div style={{ paddingLeft: 16 }}>
          + <span style={{ color: '#8b5cf6' }}>{Math.round(weights.creator * 100)}%</span> x CreatorFactor (lead=100, other=50)
        </div>
        <div style={{ paddingLeft: 16 }}>
          + <span style={{ color: '#38bdf8' }}>{Math.round(weights.graph * 100)}%</span> x GraphFactor (0-100, deps + critical path)
        </div>
      </div>
    </div>
  );
}

// === SG Field Mapping Tab ===

interface FieldMapping {
  sgField: string;
  ttField: string;
  required: boolean;
}

const REQUIRED_TT_FIELDS: { field: string; label: string; description: string }[] = [
  { field: 'name', label: 'Ticket Title', description: 'Maps to task name' },
  { field: 'sgStatus', label: 'SG Status', description: 'Maps to task status in tech-tree' },
  { field: 'sgProjectId', label: 'Project ID', description: 'ShotGrid project ID' },
  { field: 'sgEstimate', label: 'Estimate', description: 'Time estimate from SG' },
];

const OPTIONAL_TT_FIELDS: { field: string; label: string; description: string }[] = [
  { field: 'description', label: 'Description', description: 'Task description' },
  { field: 'sgTimeLogged', label: 'Time Logged', description: 'Time already logged' },
  { field: 'sgAssignedTo', label: 'Assignees', description: 'Users assigned to ticket' },
];

function SgFieldMapping() {
  const [mappings, setMappings] = useState<FieldMapping[]>([
    { sgField: 'title', ttField: 'name', required: true },
    { sgField: 'sg_status_list', ttField: 'sgStatus', required: true },
    { sgField: 'project', ttField: 'sgProjectId', required: true },
    { sgField: 'sg_estimate', ttField: 'sgEstimate', required: true },
    { sgField: 'description', ttField: 'description', required: false },
    { sgField: 'time_logs_sum', ttField: 'sgTimeLogged', required: false },
    { sgField: 'addressings_to', ttField: 'sgAssignedTo', required: false },
  ]);
  const [customFields, setCustomFields] = useState<{ sg: string; tt: string }[]>([]);
  const [newSgField, setNewSgField] = useState('');
  const [newTtField, setNewTtField] = useState('');
  const [phase, setPhase] = useState<'idle' | 'validating' | 'done' | 'error'>('idle');
  const [validationResult, setValidationResult] = useState<string[]>([]);

  const addCustomField = () => {
    if (newSgField.trim() && newTtField.trim()) {
      setCustomFields([...customFields, { sg: newSgField.trim(), tt: newTtField.trim() }]);
      setNewSgField('');
      setNewTtField('');
    }
  };

  const removeCustomField = (index: number) => {
    setCustomFields(customFields.filter((_, i) => i !== index));
  };

  const validateMappings = async () => {
    setPhase('validating');
    setValidationResult([]);
    try {
      const res = await fetch('/api/sg/validate-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings, customFields }),
      });
      const data = await res.json();
      setValidationResult(data.results || []);
      setPhase(data.valid ? 'done' : 'error');
    } catch (e) {
      setValidationResult([String(e)]);
      setPhase('error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Required Fields */}
      <div style={sectionStyle}>
        <h2 style={headingStyle}>Required Field Mappings</h2>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '0 0 16px' }}>
          These fields must be present in SG tickets for import to work. Tech-tree validates these on import.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {REQUIRED_TT_FIELDS.map((req) => {
            const mapping = mappings.find(m => m.ttField === req.field);
            return (
              <div
                key={req.field}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '8px 12px',
                  borderRadius: 6,
                  backgroundColor: 'var(--color-bg-tertiary)',
                  border: mapping ? '1px solid #22c55e40' : '1px solid #ef444440',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>
                    {req.label}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                    {req.description}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>←</span>
                  <input
                    type="text"
                    value={mapping?.sgField || ''}
                    onChange={(e) => {
                      setMappings(mappings.map(m =>
                        m.ttField === req.field ? { ...m, sgField: e.target.value } : m
                      ));
                    }}
                    placeholder="SG field name"
                    style={{
                      width: 140,
                      padding: '4px 8px',
                      borderRadius: 4,
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-bg-secondary)',
                      color: 'var(--color-text-primary)',
                      fontSize: 12,
                    }}
                  />
                </div>
                {mapping?.sgField ? (
                  <span style={{ fontSize: 11, color: '#22c55e' }}>✓</span>
                ) : (
                  <span style={{ fontSize: 11, color: '#ef4444' }}>Required</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Optional Fields */}
      <div style={sectionStyle}>
        <h2 style={headingStyle}>Optional Field Mappings</h2>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '0 0 16px' }}>
          These fields are optional but recommended for full functionality.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {OPTIONAL_TT_FIELDS.map((opt) => {
            const mapping = mappings.find(m => m.ttField === opt.field);
            return (
              <div
                key={opt.field}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '8px 12px',
                  borderRadius: 6,
                  backgroundColor: 'var(--color-bg-tertiary)',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>
                    {opt.label}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                    {opt.description}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>←</span>
                  <input
                    type="text"
                    value={mapping?.sgField || ''}
                    onChange={(e) => {
                      if (mapping) {
                        setMappings(mappings.map(m =>
                          m.ttField === opt.field ? { ...m, sgField: e.target.value } : m
                        ));
                      }
                    }}
                    placeholder="SG field name"
                    style={{
                      width: 140,
                      padding: '4px 8px',
                      borderRadius: 4,
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-bg-secondary)',
                      color: 'var(--color-text-primary)',
                      fontSize: 12,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Custom Fields */}
      <div style={sectionStyle}>
        <h2 style={headingStyle}>Custom Field Mappings</h2>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '0 0 16px' }}>
          Add any custom ShotGrid fields you want to sync. These are stored locally and passed through on import.
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            type="text"
            value={newSgField}
            onChange={(e) => setNewSgField(e.target.value)}
            placeholder="SG custom field (e.g. sg_custom_color)"
            style={{
              flex: 1,
              padding: '6px 10px',
              borderRadius: 4,
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-bg-tertiary)',
              color: 'var(--color-text-primary)',
              fontSize: 12,
            }}
          />
          <span style={{ color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center' }}>→</span>
          <input
            type="text"
            value={newTtField}
            onChange={(e) => setNewTtField(e.target.value)}
            placeholder="Tech-tree field name"
            style={{
              flex: 1,
              padding: '6px 10px',
              borderRadius: 4,
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-bg-tertiary)',
              color: 'var(--color-text-primary)',
              fontSize: 12,
            }}
          />
          <button
            onClick={addCustomField}
            disabled={!newSgField.trim() || !newTtField.trim()}
            style={{
              padding: '6px 12px',
              borderRadius: 4,
              border: 'none',
              backgroundColor: 'var(--color-accent)',
              color: '#0f172a',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              opacity: (!newSgField.trim() || !newTtField.trim()) ? 0.5 : 1,
            }}
          >
            Add
          </button>
        </div>
        {customFields.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {customFields.map((f, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 10px',
                  borderRadius: 4,
                  backgroundColor: 'var(--color-bg-tertiary)',
                }}
              >
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{f.sg}</span>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>→</span>
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{f.tt}</span>
                <button
                  onClick={() => removeCustomField(i)}
                  style={{
                    marginLeft: 'auto',
                    padding: '2px 8px',
                    borderRadius: 4,
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'transparent',
                    color: 'var(--color-text-muted)',
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Validation */}
      <div style={sectionStyle}>
        <h2 style={headingStyle}>Validate</h2>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '0 0 12px' }}>
          Check if the current mappings work with recent ShotGrid tickets.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={validateMappings}
            disabled={phase === 'validating'}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              border: 'none',
              backgroundColor: 'var(--color-accent)',
              color: '#0f172a',
              fontSize: 12,
              fontWeight: 600,
              cursor: phase === 'validating' ? 'default' : 'pointer',
              opacity: phase === 'validating' ? 0.6 : 1,
            }}
          >
            {phase === 'validating' ? 'Validating...' : 'Validate Mappings'}
          </button>
        </div>
        {phase === 'done' && validationResult.length === 0 && (
          <div style={{
            marginTop: 12,
            padding: '10px 14px',
            borderRadius: 6,
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            fontSize: 12,
            color: '#22c55e',
          }}>
            ✓ All required fields are present in recent SG tickets
          </div>
        )}
        {phase === 'error' && validationResult.length > 0 && (
          <div style={{
            marginTop: 12,
            padding: '10px 14px',
            borderRadius: 6,
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            fontSize: 12,
            color: '#ef4444',
          }}>
            <strong>Validation issues:</strong>
            {validationResult.map((r, i) => <div key={i} style={{ marginTop: 4 }}>{r}</div>)}
          </div>
        )}
      </div>
    </div>
  );
}

// === Role Management Tab ===

function RoleManagementTab() {
  const userName = useStore((s) => s.userName);
  const adminPassword = useStore((s) => s.adminPassword);
  const [users, setUsers] = useState<{ name: string; role: string; created_at: string }[]>([]);
  const [updating, setUpdating] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/users').then((r) => r.json()).then(setUsers).catch(() => {});
  }, []);

  const handleRoleChange = async (targetName: string, newRole: UserRole) => {
    if (!adminPassword) return;
    setUpdating(targetName);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(targetName)}/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole, adminPassword }),
      });
      if (res.ok) {
        setUsers((prev) => prev.map((u) => u.name === targetName ? { ...u, role: newRole } : u));
      }
    } catch { /* ignore */ }
    setUpdating(null);
  };

  const filteredUsers = users.filter(u => u.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={sectionStyle}>
      <h2 style={headingStyle}>Role Management</h2>
      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '0 0 12px' }}>
        Assign roles to users. Coordinators can edit tasks and priorities, workers can only view and update their own task status. Admin access is granted via password upgrade.
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <input
          type="text"
          placeholder="Search users..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1, padding: '6px 10px', borderRadius: 6,
            border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-secondary)',
            color: 'var(--color-text-primary)', fontSize: 12,
          }}
        />
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)', flexShrink: 0 }}>
          {filteredUsers.length} / {users.length}
        </span>
      </div>
      <div style={{ borderRadius: 8, border: '1px solid var(--color-border)', overflow: 'hidden' }}>
        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
          {filteredUsers.map((u, i) => {
            return (
              <div
                key={u.name}
                style={{
                  padding: '10px 14px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  borderBottom: i < filteredUsers.length - 1 ? '1px solid var(--color-bg-tertiary)' : 'none',
                }}
              >
                <div>
                  <div style={{ fontSize: 13, color: 'var(--color-text-primary)', fontWeight: u.name === userName ? 600 : 400 }}>
                    {u.name}{u.name === userName ? ' (you)' : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 3 }}>
                  {(['worker', 'coordinator'] as const).map((role) => (
                    <button
                      key={role}
                      onClick={() => handleRoleChange(u.name, role)}
                      disabled={updating === u.name}
                      style={{
                        fontSize: 10, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
                        border: u.role === role ? `1px solid ${ROLE_COLORS[role]}` : '1px solid var(--color-border)',
                        backgroundColor: u.role === role ? `${ROLE_COLORS[role]}20` : 'transparent',
                        color: u.role === role ? ROLE_COLORS[role] : 'var(--color-text-muted)',
                        fontWeight: u.role === role ? 600 : 400,
                        opacity: updating === u.name ? 0.5 : 1,
                      }}
                    >
                      {role}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {filteredUsers.length === 0 && (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 12 }}>
              {users.length === 0 ? 'No users registered' : 'No matching users'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const ROLE_COLORS: Record<string, string> = { admin: '#ef4444', coordinator: '#f59e0b', worker: '#6b7280' };

// === Main Settings View ===

export function SettingsView() {
  const storeWeights = useStore((s) => s.calibrationWeights);
  const setCalibrationWeights = useStore((s) => s.setCalibrationWeights);
  const adminPassword = useStore((s) => s.adminPassword);
  const sgPriorityAutoSync = useStore((s) => s.sgPriorityAutoSync);
  const setSgPriorityAutoSync = useStore((s) => s.setSgPriorityAutoSync);

  const currentWeights = storeWeights && 'goal' in storeWeights ? storeWeights : DEFAULT_WEIGHTS;

  const [activeTab, setActiveTab] = useState<SettingsTab>('priority');
  const [localWeights, setLocalWeights] = useState<CalibrationWeights>(currentWeights);
  const [saved, setSaved] = useState(false);
  const [showWizard, setShowWizard] = useState(false);

  const isDefault = useMemo(() => {
    return localWeights.project === DEFAULT_WEIGHTS.project &&
      localWeights.dept === DEFAULT_WEIGHTS.dept &&
      localWeights.goal === DEFAULT_WEIGHTS.goal &&
      localWeights.creator === DEFAULT_WEIGHTS.creator &&
      localWeights.graph === DEFAULT_WEIGHTS.graph;
  }, [localWeights]);

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
    setShowWizard(false);
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
            Configure priority weights, lead list, role management, and SG import
          </p>
        </div>

        {/* Tab Bar */}
        <TabBar active={activeTab} onChange={setActiveTab} />

        {/* Tab Content */}
        {activeTab === 'priority' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Priority Weights */}
            <div style={sectionStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h2 style={{ ...headingStyle, margin: 0 }}>Priority Weights</h2>
                <button
                  onClick={() => setShowWizard(true)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 6,
                    border: '1px solid var(--color-accent)',
                    backgroundColor: 'rgba(56, 189, 248, 0.08)',
                    color: 'var(--color-accent)',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Enter Priority Wizard
                </button>
              </div>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '0 0 16px' }}>
                Adjust sliders to set how much each factor contributes to the computed priority score. Weights must sum to 100%.
              </p>
              <WeightSliders weights={localWeights} onChange={setLocalWeights} />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
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
            <LeadList />

            {/* Formula Preview */}
            <FormulaPreview weights={localWeights} />
          </div>
        )}

        {activeTab === 'roles' && <RoleManagementTab />}

        {activeTab === 'sg' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* SG Priority Auto-Sync */}
            <div style={sectionStyle}>
              <h2 style={headingStyle}>Priority Auto-Sync</h2>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '0 0 12px' }}>
                When enabled, the calculated priority score (0-100) will automatically sync back to ShotGrid as priority 5-1 (inverse mapping: 100=1, 0=5).
              </p>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <div
                  onClick={() => {
                    const newValue = !sgPriorityAutoSync;
                    setSgPriorityAutoSync(newValue);
                  }}
                  style={{
                    width: 44,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: sgPriorityAutoSync ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
                    border: `1px solid ${sgPriorityAutoSync ? 'var(--color-accent)' : 'var(--color-border)'}`,
                    position: 'relative',
                    transition: 'background-color 0.2s',
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      backgroundColor: sgPriorityAutoSync ? '#0f172a' : 'var(--color-text-muted)',
                      position: 'absolute',
                      top: 2,
                      left: sgPriorityAutoSync ? 22 : 2,
                      transition: 'left 0.2s',
                    }}
                  />
                </div>
                <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                  {sgPriorityAutoSync ? 'Enabled' : 'Disabled'}
                </span>
              </label>
              {sgPriorityAutoSync && (
                <div style={{
                  marginTop: 12,
                  padding: '10px 14px',
                  borderRadius: 6,
                  backgroundColor: 'var(--color-bg-tertiary)',
                  fontSize: 12,
                  color: 'var(--color-text-muted)',
                }}>
                  <strong style={{ color: 'var(--color-text-secondary)' }}>Mapping:</strong> tech-tree score → SG priority<br/>
                  100 → 1 (highest) · 75 → 2 · 50 → 3 · 25 → 4 · 0 → 5 (lowest)
                </div>
              )}
            </div>

            <SgFieldMapping />
            {adminPassword && <SgStatusMapInbound adminPassword={adminPassword} />}
            {adminPassword && <SgStatusMap adminPassword={adminPassword} />}
            {adminPassword && <SettingsSgSync adminPassword={adminPassword} />}
          </div>
        )}

        {activeTab === 'logs' && <LogViewer />}
      </div>

      {/* Priority Wizard Modal */}
      {showWizard && (
        <PriorityWizardModal
          onComplete={handleWizardComplete}
          onClose={() => setShowWizard(false)}
        />
      )}
    </div>
  );
}
