function App() {
  return (
    <div className="flex h-screen flex-col items-center justify-center bg-gray-950 text-white">
      <div className="mb-8 rounded-full bg-gray-800 p-6">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="h-12 w-12 text-blue-400"
        >
          <path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" />
          <path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 1010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.751 6.751 0 01-6 6.709v2.291h3a.75.75 0 010 1.5h-7.5a.75.75 0 010-1.5h3v-2.291a6.751 6.751 0 01-6-6.709v-1.5A.75.75 0 016 10.5z" />
        </svg>
      </div>
      <h1 className="mb-2 text-2xl font-bold">Scribe</h1>
      <p className="mb-8 text-gray-400">
        Meeting transcription & summarization
      </p>
      <button className="rounded-full bg-blue-600 px-8 py-3 font-semibold text-white transition-colors hover:bg-blue-500">
        Start Recording
      </button>
    </div>
  );
}

export default App;
