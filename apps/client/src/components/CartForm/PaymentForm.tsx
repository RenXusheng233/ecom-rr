import { paymentFormSchema } from '@/schemas'
import { PaymentFormInputs } from '@/types'
import { zodResolver } from '@hookform/resolvers/zod'
import { ShoppingCart } from 'lucide-react'
import Image from 'next/image'
import {
  FieldErrors,
  SubmitHandler,
  useForm,
  UseFormRegister,
} from 'react-hook-form'

type TInputForm = {
  keyName: keyof PaymentFormInputs
  placeholder: string
  register: UseFormRegister<PaymentFormInputs>
  errors: FieldErrors<PaymentFormInputs>
}

const InputForm = ({ keyName, placeholder, register, errors }: TInputForm) => {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={keyName} className="text-xs text-gray-500 font-medium">
        {keyName.charAt(0).toUpperCase() + keyName.slice(1)}
      </label>
      <input
        type="text"
        className="border-b border-gray-200 py-2 outline-none text-sm"
        id={keyName}
        placeholder={placeholder}
        {...register(keyName)}
      />
      {errors[keyName] && (
        <p className="text-xs text-red-500">{errors[keyName]?.message}</p>
      )}
    </div>
  )
}

const PaymentForm = () => {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PaymentFormInputs>({
    resolver: zodResolver(paymentFormSchema),
  })

  const handlePaymentForm: SubmitHandler<PaymentFormInputs> = () => {
    // TODO: Buy these items
    console.log('buy these items')
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={handleSubmit(handlePaymentForm)}
    >
      <InputForm
        keyName="cardHolder"
        placeholder="Richard Ren"
        register={register}
        errors={errors}
      />
      <InputForm
        keyName="cardNumber"
        placeholder="1234567890123456"
        register={register}
        errors={errors}
      />
      <InputForm
        keyName="expirationDate"
        placeholder="12/28"
        register={register}
        errors={errors}
      />
      <InputForm
        keyName="cvv"
        placeholder="321"
        register={register}
        errors={errors}
      />
      <div className="flex items-center gap-2 mt-4">
        <Image
          src="/klarna.png"
          alt="klarna"
          width={50}
          height={25}
          className="rounded-md"
        />
        <Image
          src="/cards.png"
          alt="cards"
          width={50}
          height={25}
          className="rounded-md"
        />
        <Image
          src="/stripe.png"
          alt="stripe"
          width={50}
          height={25}
          className="rounded-md"
        />
      </div>
      <button
        type="submit"
        className="w-full bg-gray-800 text-white p-2 rounded-lg cursor-pointer flex gap-2
                         items-center justify-center hover:bg-gray-900 transition-all duration-300"
      >
        Checkout
        <ShoppingCart className="w-3 h-3" />
      </button>
    </form>
  )
}

export default PaymentForm
