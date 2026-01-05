declare module 'pdfjs-dist/legacy/build/pdf' {
  // pdfjs-dist legacy build is consumed via dynamic import for client-side rendering.
  // We intentionally keep this loose to avoid TS issues with package `exports` + `.mjs` internals.
  export const getDocument: any
  export const GlobalWorkerOptions: any
}

declare module 'pdfjs-dist/legacy/build/pdf.worker.min.mjs' {
  const workerSrc: string
  export default workerSrc
}


