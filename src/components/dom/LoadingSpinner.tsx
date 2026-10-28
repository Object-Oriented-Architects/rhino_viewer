/** 뷰어 칸을 덮는 로딩 표시 (부모는 relative) */
export const LoadingSpinner = ({ message }: { message: string }) => (
  <div className='absolute inset-0 z-50 flex flex-col items-center justify-center bg-black bg-opacity-70'>
    <svg className='-ml-1 mr-3 size-8 animate-spin text-white' fill='none' viewBox='0 0 24 24'>
      <circle className='opacity-25' cx='12' cy='12' r='10' stroke='currentColor' strokeWidth='4' />
      <path
        className='opacity-75'
        fill='currentColor'
        d='M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'
      />
    </svg>
    <p className='mt-4 text-lg text-white'>{message}</p>
  </div>
)
