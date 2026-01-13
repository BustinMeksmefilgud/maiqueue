import pearto from '../assets/pearto-kasane-teto.gif'

export default function Pear() {
  return (
    <div className="h-full bg-black align-middle">
      {/* Just use the file name with a slash */}
      <img src={pearto} alt="Cool animation" className="rounded-lg shadow-xl" />
    </div>
  )
}