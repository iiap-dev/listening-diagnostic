import { useRef, useState } from 'react'
import questions from './data/questions.json'

const GOOGLE_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbxdneV7lcEHX7Au8dAkJif42CclSLxATYB71sDi5_Qb843g6r9gGW6nH6ZfkgZrBazH3A/exec'

type Option = {
  id: string
  text: string
}

type SubQuestion = {
  id: string
  question: string
  options: Option[]
}

type Question = {
  id: string
  audio: string
  question?: string
  options?: Option[]
  subquestions?: SubQuestion[]
}

type Answers = Record<string, string>
type HeardWords = Record<string, string>

function App() {
  const [screen, setScreen] = useState<'start' | 'test' | 'thankyou'>('start')
  const [group, setGroup] = useState('')
  const [fullName, setFullName] = useState('')
  const [currentIndex, setCurrentIndex] = useState(0)

  const [answers, setAnswers] = useState<Answers>({})
  const [heardWords, setHeardWords] = useState<HeardWords>({})

  const [playCount, setPlayCount] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const audioRef = useRef<HTMLAudioElement | null>(null)

  const currentQuestion = questions[currentIndex] as Question

  const getRequiredAnswerIds = (question: Question): string[] => {
    if (question.subquestions) {
      return question.subquestions.map((subquestion) => subquestion.id)
    }

    return [question.id]
  }

    const hasHeardWords = Boolean(
      heardWords[currentQuestion.id]?.trim(),
    )
    
    const hasAllAnswers = getRequiredAnswerIds(currentQuestion).every(
      (id) => answers[id],
    )
    
    const canContinue = hasAllAnswers || hasHeardWords

  const handleStart = () => {
    if (!group.trim() || !fullName.trim()) return

    setScreen('test')
  }

  const handlePlay = () => {
    if (!audioRef.current || playCount >= 2 || isPlaying) return

    setIsPlaying(true)
    setPlayCount((count) => count + 1)

    audioRef.current.currentTime = 0

    audioRef.current.play().catch(() => {
      setIsPlaying(false)
    })
  }

  const handleAnswer = (questionId: string, optionId: string) => {
    setAnswers((previous) => ({
      ...previous,
      [questionId]: optionId,
    }))
  }

  const handleHeardWords = (text: string) => {
    setHeardWords((previous) => ({
      ...previous,
      [currentQuestion.id]: text,
    }))
  }

  const handleNext = async () => {
    if (!canContinue) return

    if (currentIndex === questions.length - 1) {
    setIsSubmitting(true)
    
    const completeAnswers: Answers = {}
    
    questions.forEach((question) => {
      const current = question as Question
    
      if (current.subquestions) {
        current.subquestions.forEach((subquestion) => {
          completeAnswers[subquestion.id] = answers[subquestion.id] ?? ''
        })
      } else {
        completeAnswers[current.id] = answers[current.id] ?? ''
      }
    })
    
    const submission = {
      timestamp: new Date().toISOString(),
      group: group.trim(),
      fullName: fullName.trim(),
      answers: completeAnswers,
      heardWords,
    }
    
    try {
      await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify(submission),
      })
    
      setScreen('thankyou')
    } catch (error) {
      console.error('Submission failed:', error)
      setIsSubmitting(false)
      alert('Не вдалося надіслати відповіді. Спробуйте ще раз.')
    }
    
    return
    }
    

    setCurrentIndex((index) => index + 1)
    setPlayCount(0)
    setIsPlaying(false)
  }

  if (screen === 'start') {
    return (
      <main className="app">
        <section className="card start-card">
          <h1>English Listening Diagnostic</h1>

          <p className="intro">
            Введіть вашу групу та ім'я, щоб почати тест.
          </p>

          <label>
            Group
            <input
              type="text"
              value={group}
              onChange={(event) => setGroup(event.target.value)}
              placeholder="Enter your group"
            />
          </label>

          <label>
            Full name
            <input
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Enter your full name"
            />
          </label>

          <button
            className="primary-button"
            onClick={handleStart}
            disabled={!group.trim() || !fullName.trim()}
          >
            Start
          </button>
        </section>
      </main>
    )
  }

  if (screen === 'thankyou') {
    return (
      <main className="app">
        <section className="card thankyou-card">
          <h1>Thank you!</h1>

          <p>
            Ви завершили тест.
          </p>
        </section>
      </main>
    )
  }

  return (
    <main className="app">
      <section className="card test-card">
        <div className="progress">
          Question {currentIndex + 1} / {questions.length}
        </div>

        <h1>Question {currentIndex + 1}</h1>

        <p className="instruction">
          Прослухайте аудіо. Ви можете прослухати його максимум двічі.
        </p>

        <div className="audio-section">
          <audio
            ref={audioRef}
            src={`${import.meta.env.BASE_URL}${currentQuestion.audio.replace(/^\/+/, '')}`}
            preload="metadata"
            onEnded={() => setIsPlaying(false)}
          />

          <button
            className="play-button"
            onClick={handlePlay}
            disabled={playCount >= 2 || isPlaying}
          >
            {isPlaying ? 'Playing...' : '▶ Play audio'}
          </button>

          <p className="play-counter">
            Прослуховувань: {playCount} / 2
          </p>
        </div>

        {currentQuestion.question && currentQuestion.options && (
          <div className="question-block">
            <h2>{currentQuestion.question}</h2>

            <p className="answer-instruction">
              Оберіть одну відповідь.
            </p>

            <div className="options">
              {currentQuestion.options.map((option) => (
                <label className="option" key={option.id}>
                  <input
                    type="radio"
                    name={currentQuestion.id}
                    checked={answers[currentQuestion.id] === option.id}
                    onChange={() =>
                      handleAnswer(currentQuestion.id, option.id)
                    }
                  />
                  <span>{option.text}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {currentQuestion.subquestions && (
          <div className="subquestions">
            <p className="answer-instruction">
              Прослухайте аудіо та дайте відповіді на всі питання нижче.
            </p>

            {currentQuestion.subquestions.map((subquestion) => (
              <div className="question-block" key={subquestion.id}>
                <h2>{subquestion.question}</h2>

                <div className="options">
                  {subquestion.options.map((option) => (
                    <label className="option" key={option.id}>
                      <input
                        type="radio"
                        name={subquestion.id}
                        checked={answers[subquestion.id] === option.id}
                        onChange={() =>
                          handleAnswer(subquestion.id, option.id)
                        }
                      />
                      <span>{option.text}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="heard-section">
          <h2>Що ви почули?</h2>

          <p>
            Не впевнені у відповіді? Напишіть слова або фрази, які ви почули.
            Навіть якщо ви не знаєте їхнього значення.
          </p>

          <textarea
            value={heardWords[currentQuestion.id] ?? ''}
            onChange={(event) => handleHeardWords(event.target.value)}
            placeholder="Напишіть слова або фрази, які ви почули..."
            rows={3}
          />
        </div>

        <button
          className="primary-button next-button"
          onClick={handleNext}
          disabled={!canContinue}
        >
           {currentIndex === questions.length - 1
    ? isSubmitting
      ? 'Sending...'
      : 'Submit'
    : 'Next'}
        </button>
      </section>
    </main>
  )
}

export default App