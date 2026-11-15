import { useCallback, useEffect, useState } from "react";
import Icon from "../../components/Icon";
import Segmented from "../../components/Segmented";
import { QUIZ_KINDS, Question, QuizKind, Scope, makeQuestion } from "./quiz";

const LETTERS = ["A", "B", "C", "D", "E", "F"];

/**
 * Quiz: a question on the board, the class answers, the teacher taps the
 * class's choice to reveal. Questions come from the reference's own data.
 */
export default function QuizView({ classView }: { classView: boolean }) {
  const [kind, setKind] = useState<QuizKind>("symbol-to-name");
  const [scope, setScope] = useState<Scope>("simplified");
  const [options, setOptions] = useState<number>(4);
  const [question, setQuestion] = useState<Question>(() => makeQuestion("symbol-to-name", "simplified", Math.random, 4));
  const [chosen, setChosen] = useState<string | null>(null);
  const [score, setScore] = useState({ right: 0, asked: 0 });

  const next = useCallback(
    (k = kind, s = scope, o = options) => {
      setQuestion(makeQuestion(k, s, Math.random, o));
      setChosen(null);
    },
    [kind, scope, options],
  );

  const choose = (option: string) => {
    if (chosen !== null) return;
    setChosen(option);
    setScore((prev) => ({ right: prev.right + (option === question.answer ? 1 : 0), asked: prev.asked + 1 }));
  };

  // Keyboard: A–F to answer, space or enter for the next question.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
      const index = LETTERS.indexOf(e.key.toUpperCase());
      if (index >= 0 && index < question.options.length && chosen === null) choose(question.options[index]);
      else if ((e.key === " " || e.key === "Enter") && chosen !== null) {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const about = QUIZ_KINDS.find((k) => k.kind === kind)?.about ?? "";
  const revealed = chosen !== null;

  return (
    <div className={`quiz ${classView ? "class-view" : ""}`}>
      {!classView && (
        <div className="quiz-settings panel">
          <label className="quiz-field">
            <span className="muted">Ask about</span>
            <select
              value={kind}
              onChange={(e) => {
                const k = e.target.value as QuizKind;
                setKind(k);
                next(k, scope, options);
              }}
              aria-label="Question type"
            >
              {QUIZ_KINDS.map((k) => (
                <option key={k.kind} value={k.kind}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <div className="quiz-field">
            <span className="muted">From</span>
            <Segmented
              small
              label="Scope"
              options={[
                { value: "simplified", label: kind.startsWith("ion") || kind === "name-to-ion" ? "Syllabus table" : "Simplified table" },
                { value: "all", label: "Everything" },
              ]}
              value={scope}
              onChange={(s) => {
                setScope(s);
                next(kind, s, options);
              }}
            />
          </div>
          <div className="quiz-field">
            <span className="muted">Choices</span>
            <Segmented
              small
              label="Number of choices"
              options={[
                { value: 2, label: "2" },
                { value: 4, label: "4" },
                { value: 6, label: "6" },
              ]}
              value={options}
              onChange={(o) => {
                setOptions(o);
                next(kind, scope, o);
              }}
            />
          </div>
          <div className="quiz-score">
            <span className="muted">Score</span>
            <strong>
              {score.right} / {score.asked}
            </strong>
            <button className="small" onClick={() => setScore({ right: 0, asked: 0 })} disabled={score.asked === 0}>
              Reset
            </button>
          </div>
        </div>
      )}

      <div className="quiz-card panel">
        <div className="quiz-about muted">{about}</div>
        <div className="quiz-prompt">{question.prompt}</div>
        {question.hint && <div className="quiz-hint muted">{question.hint}</div>}
        <div className="quiz-options">
          {question.options.map((option, i) => {
            const state = !revealed ? "" : option === question.answer ? "right" : option === chosen ? "wrong" : "dim";
            return (
              <button key={option} className={`quiz-option ${state}`} onClick={() => choose(option)} disabled={revealed} aria-pressed={chosen === option}>
                <span className="quiz-letter">{LETTERS[i]}</span>
                <span className="quiz-text">{option}</span>
                {state === "right" && <Icon name="check" size={22} />}
                {state === "wrong" && <Icon name="close" size={22} />}
              </button>
            );
          })}
        </div>
        {revealed && <p className="quiz-explanation">{question.explanation}</p>}
        <div className="row quiz-actions">
          {!revealed ? (
            <button onClick={() => choose("")} title="Show the answer without choosing">
              <Icon name="visibility" size={20} /> Reveal
            </button>
          ) : (
            <button className="primary" onClick={() => next()} autoFocus>
              <Icon name="skip_next" size={20} /> Next question
            </button>
          )}
          {classView && (
            <span className="muted quiz-score-inline">
              {score.right} / {score.asked}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
