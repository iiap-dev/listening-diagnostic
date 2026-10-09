import { useEffect, useRef, useState } from 'react'
import questions from './data/questions.json'
import { supabase, ensureSupabaseSession } from './supabase'

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
type SpeakingRecordingMetadata = {
  testAttemptId: string
  taskId: string
  group: string
  fullName: string
  storagePath: string
  duration: number
  submittedAt: string
  uploadStatus: 'success' | 'error'
}

function App() {
  const [screen, setScreen] = useState<'start' | 'test' | 'speaking-test' | 'thankyou'>('start')
  const [group, setGroup] = useState('')
  const [fullName, setFullName] = useState('')
  const [testAttemptId, setTestAttemptId] = useState('')
  const [speakingTask, setSpeakingTask] = useState(1)
  const [currentIndex, setCurrentIndex] = useState(0)
  const uploadInProgressRef = useRef(false)

  const [answers, setAnswers] = useState<Answers>({})
  const [heardWords, setHeardWords] = useState<HeardWords>({})
  const [validationMessage, setValidationMessage] = useState('')

  const [isPlaying, setIsPlaying] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isUploadingRecording, setIsUploadingRecording] = useState(false)
  const [recordedAudioUrl, setRecordedAudioUrl] = useState('')
  const [recordedAudioBlob, setRecordedAudioBlob] = useState<Blob | null>(null)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [uploadMessage, setUploadMessage] = useState('')


    useEffect(() => {
      window.scrollTo({ top: 0, behavior: 'instant' })
    }, [screen, currentIndex])


  const audioRef = useRef<HTMLAudioElement | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])

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

    const startRecording = async () => {
      if (isRecording || mediaRecorderRef.current) return
    
      setRecordedAudioUrl('')
      setRecordedAudioBlob(null)
      setRecordingDuration(0)
    
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      })
    
      recordedChunksRef.current = []
    
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
      })
    
      mediaRecorderRef.current = mediaRecorder
    
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data)
        }
      }
    
      mediaRecorder.start()
      setIsRecording(true)
    }

  const stopRecording = () => {
      const mediaRecorder = mediaRecorderRef.current
    
      if (!mediaRecorder) return
    
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(recordedChunksRef.current, {
          type: 'audio/webm',
        })
    
        const audioUrl = URL.createObjectURL(audioBlob)
        setRecordedAudioUrl(audioUrl)
        setRecordedAudioBlob(audioBlob)

        const audio = new Audio(audioUrl)

        audio.addEventListener('loadedmetadata', () => {
          setRecordingDuration(audio.duration)
        })
    
        mediaRecorder.stream.getTracks().forEach((track) => track.stop())
        mediaRecorderRef.current = null
      }
    
      mediaRecorder.stop()
      setIsRecording(false)
  }

  const SPEAKING_SHEETS_URL = 'https://script.google.com/macros/s/AKfycbzeMFszcqWuyo8qmjyQaJ8ETLQCPjUAUhAtZtD1XVvZE8SAmYsYQs_Q4gSoCd636W2iNA/exec'

    

const uploadTaskRecording = async (
  taskId: string,
  audioBlob: Blob,
) => {
  if (!testAttemptId || uploadInProgressRef.current) {
  return false
    }
    
    uploadInProgressRef.current = true
    setIsUploadingRecording(true)
    setUploadMessage('')

  try {
    await ensureSupabaseSession()

    const filePath = `speaking/${testAttemptId}/task-${taskId}.webm`

    const { error } = await supabase.storage
      .from('speaking-audio')
      .upload(filePath, audioBlob, {
        contentType: 'audio/webm',
      })

    if (error) {
      setUploadMessage('Не вдалося надіслати запис. Спробуйте ще раз.')
      return false
    }

    const metadata: SpeakingRecordingMetadata = {
      testAttemptId,
      taskId,
      group,
      fullName,
      storagePath: filePath,
      duration: recordingDuration,
      submittedAt: new Date().toISOString(),
      uploadStatus: 'success',
    }

    const { error: metadataError } = await supabase
      .from('speaking_recordings')
      .insert({
        test_attempt_id: metadata.testAttemptId,
        task_id: metadata.taskId,
        group: metadata.group,
        full_name: metadata.fullName,
        storage_path: metadata.storagePath,
        duration: metadata.duration,
        submitted_at: metadata.submittedAt,
        upload_status: metadata.uploadStatus,
      })

    if (metadataError) {
      console.error('Metadata insert error:', metadataError)
      setUploadMessage('Запис завантажено, але не вдалося зберегти дані. Зверніться до викладача.')
      return false
    }

    try {
      await fetch(SPEAKING_SHEETS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify(metadata),
      })
    } catch (error) {
      console.error('Google Sheets error:', error)
    }

    setUploadMessage('')

    if (taskId === '1') {
      setRecordedAudioUrl('')
      setRecordedAudioBlob(null)
      setSpeakingTask(2)
    }

    if (taskId === '2') {
      setRecordedAudioUrl('')
      setRecordedAudioBlob(null)
      setSpeakingTask(3)
    }

    if (taskId === '3') {
      setRecordedAudioUrl('')
      setRecordedAudioBlob(null)
      setScreen('thankyou')
    }

    return true
  } catch (error) {
    console.error('Speaking upload failed:', error)
    setUploadMessage('Не вдалося надіслати запис. Спробуйте ще раз.')
    return false
  } finally {
      uploadInProgressRef.current = false
      setIsUploadingRecording(false)
  }
}

    
    const testMode = new URLSearchParams(window.location.search).get('test')


    const handleStart = () => {
      if (!group.trim() || !fullName.trim()) return
    
      const attemptId = crypto.randomUUID()
    
      setTestAttemptId(attemptId)
      setScreen('test')
    }

    const handleSpeakingTestStart = () => {
      if (!group.trim() || !fullName.trim()) return
    
      const attemptId = crypto.randomUUID()
    
      setTestAttemptId(attemptId)
      setScreen('speaking-test')
    }

  const handlePlay = () => {
    if (!audioRef.current) return

    if (isPlaying) {
      audioRef.current.pause()
      return
    }

    audioRef.current.currentTime = 0
    audioRef.current.play()
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
    if (isSubmitting) return
    
    if (!canContinue) {

        if (questionCount === 3) {
          setValidationMessage(
            'Не можете відповісти на всі питання? Напишіть додатково у поле внизу сторінки слова, які ви почули в аудіо.',
          )
        } else {
          setValidationMessage(
            'Будь ласка, дайте відповідь на питання або запишіть почуті слова.',
          )
        }

      return
    }
    
    setValidationMessage('')

    if (currentIndex === questions.length - 1) {
      setIsSubmitting(true)

      const completeAnswers: Answers = {}

      questions.forEach((question) => {
        const current = question as Question

        if (current.subquestions) {
          current.subquestions.forEach((subquestion) => {
            completeAnswers[subquestion.id] =
              answers[subquestion.id] ?? ''
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
    setIsPlaying(false)
  }

  if (screen === 'start') {
    return (
      <main className="app">
        <section className="card start-card">
          <h1>English Challenge</h1>

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
            
            {uploadMessage && (
              <p>{uploadMessage}</p>
            )}


            {testMode !== 'speaking' && (
              <button
                className="primary-button"
                onClick={handleStart}
                disabled={!group.trim() || !fullName.trim()}
              >
                Start Listening Test
              </button>
            )}
            
            {testMode !== 'listening' && (
              <button
                className="primary-button"
                type="button"
                onClick={handleSpeakingTestStart}
                disabled={!group.trim() || !fullName.trim()}
              >
                Start Speaking Test
              </button>
            )}

        </section>
      </main>
    )
  }

    if (screen === 'speaking-test') {
      return (
        <main className="app">
          <section className="card">
            <h1>
              {speakingTask === 1
                ? 'Task 1. A good day'
                : speakingTask === 2
                  ? 'Task 2. A good day / A bad day'
                  : 'Task 3. Change the day'}
            </h1>
    
            <p>
              {speakingTask === 1
                ? 'Розкажіть про день, який би ви вважали хорошим.'
                : speakingTask === 2
                  ? 'Подивіться на картинку. Розкажіть про те, що ви бачите.'
                  : 'Уявіть, що у вас поганий день. Ви можете змінити лише щось одне, щоб день став кращим.'}
            </p>

            {speakingTask === 2 && (
              <img
                src="/listening-diagnostic/images/task-2.png"
                alt="A pigeon carrying a bag of chips outside a shop"
                className="speaking-task-image"
              />
            )}
    
            {speakingTask === 1 ? (
              <>
                <p>Розкажіть:</p>
                <ul>
                  <li>Where are you?</li>
                  <li>What do you do?</li>
                  <li>Who are you with?</li>
                  <li>Why is it a good day?</li>
                </ul>
              </>
            ) : speakingTask === 2 ? (
              <>
                <p>Розкажіть:</p>
                <ul>
                  <li>What can you see?</li>
                  <li>What is happening?</li>
                  <li>Is it a good or bad day? Why?</li>
                </ul>
              </>
            ) : (
              <>
                <p>Скажіть:</p>
                <ul>
                  <li>What would you change?</li>
                  <li>Why?</li>
                  <li>What would happen after that?</li>
                </ul>
              </>
            )}
    
            <h2>Useful phrases</h2>
            
            {speakingTask === 1 ? (
              <ul>
                <li>It is a good day because …</li>
                <li>I am …</li>
                <li>I usually …</li>
                <li>I am with …</li>
                <li>I feel …</li>
              </ul>
            ) : speakingTask === 2 ? (
              <ul>
                <li>I can see...</li>
              </ul>
            ) : (
              <ul>
                <li>I would change...</li>
                <li>It would be better because...</li>
                <li>After that, I would...</li>
              </ul>
            )}
    
            <h2>Help</h2>
    
            <p>
              Спробуйте відповісти англійською.
              <br />
              Якщо ви не знаєте, як сказати щось англійською,
              скажіть українською, що саме ви хотіли б сказати.
            </p>
    
            <div className="speaking-controls">
              <p className="recording-notice">
                    Ваша відповідь не повинна займати більше 1 хвилини.
              </p>
              {!recordedAudioUrl && (
              <>
                  <button
                    className={`record-button ${isRecording ? 'record-button-stop' : ''}`}
                    type="button"
                    onClick={isRecording ? stopRecording : startRecording}
                  >
                    {isRecording ? 'Stop recording' : 'Start recording'}
                  </button>
                </>
                )}

              {recordedAudioUrl && (
                <>
                  <audio controls src={recordedAudioUrl} />

                  <button
                    className="rerecord-button"
                    type="button"
                    onClick={startRecording}
                  >
                    Перезаписати
                  </button>

                <button
                  className="upload-button"
                  type="button"
                  onClick={() =>
                    uploadTaskRecording(
                      speakingTask.toString(),
                      recordedAudioBlob!,
                    )
                  }
                  disabled={!recordedAudioBlob || isUploadingRecording}
                >
                  {isUploadingRecording ? 'Надсилання...' : 'Відправити'}
                </button>
                </>
              )}
            </div>

            {uploadMessage && (
              <p className="upload-message">{uploadMessage}</p>
            )}
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

  const questionCount = currentQuestion.subquestions?.length ?? 1

  const questionInstruction =
    questionCount === 1
      ? 'Дайте відповідь на 1 питання нижче.'
      : questionCount === 2
        ? 'Дайте відповідь на 2 питання нижче.'
        : `Дайте відповідь на ${questionCount} питання нижче.`

  return (
    <main className="app">
      <section className="card test-card">
        <div className="progress">
          Question {currentIndex + 1} / {questions.length}
        </div>

        <h1>Question {currentIndex + 1}</h1>

        <p className="instruction">
          Прослухайте аудіо.
        </p>

        <div className="audio-section">
          <audio
            ref={audioRef}
            src={`${import.meta.env.BASE_URL}${currentQuestion.audio.replace(/^\/+/, '')}`}
            preload="metadata"
            onPlay={() => setIsPlaying(true)}
            onEnded={() => setIsPlaying(false)}
            onPause={() => setIsPlaying(false)}
          />

          <button
            className="play-button"
            onClick={handlePlay}
          >
            {isPlaying ? '⏹ Stop' : '▶ Play'}
          </button>
        </div>

        <p className="answer-instruction recording-notice">
          {questionInstruction}
        </p>

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


        <div className="next-button-container">
            {validationMessage && (
              <p className="validation-message" role="alert">
                {validationMessage}
              </p>
            )}
          <button
            className="primary-button next-button"
            onClick={handleNext}
          >
            {currentIndex === questions.length - 1
              ? isSubmitting
                ? 'Sending...'
                : 'Submit'
              : 'Next'}
          </button>
        </div>
      </section>
    </main>
  )
}

export default App