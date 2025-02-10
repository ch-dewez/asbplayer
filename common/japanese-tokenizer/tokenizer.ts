// No need for `@ts-ignore`, contains index.d.ts by default.
import kuromoji from '@sglkc/kuromoji'

type Tokenizer = {
  tokenize: (text: string) => kuromoji.IpadicFeatures[]
}

class Deferred {
  promise: Promise<Tokenizer>
  resolve!: (value: Tokenizer) => void
  reject!: (reason: Error) => void
  constructor() {
    this.promise = new Promise<Tokenizer>((resolve, reject) => {
      this.resolve = resolve
      this.reject = reject
    })
  }
}

const deferred = new Deferred()
let isLoading = false

export const getTokenizer = () => {
  if (isLoading) {
    return deferred.promise
  }
  isLoading = true
  const builder = kuromoji.builder({dicPath:"/assets/tokenizer/dict/"}).build((err: undefined | Error, tokenizer: Tokenizer) => {
    if (err) {
        console.log("has error"+err)
        deferred.reject(err)
    } else {
        console.log("tokenizer resolved")
        deferred.resolve(tokenizer)
    }
  })
  console.log("has build")
  return deferred.promise
}

export const tokenize = async (text: string) => {
	const tokenizer = await getTokenizer();
	const tokens = tokenizer.tokenize(text);
	return tokens;
}


export const getBasicFormFromText = async (text: string) => {
	const tokenizer = await getTokenizer();
	const tokens = tokenizer.tokenize(text);
  let basic_form = tokens.map((e) => e.basic_form)
	return basic_form;
}

export const getBasicFormAndSurfaceFormFromText = async (text: string) : Promise<{basic_form: string, surface_form: string}[]> => {
	const tokenizer = await getTokenizer();
	const tokens = tokenizer.tokenize(text);
  let forms = tokens.map((e) => {return {basic_form:e.basic_form, surface_form:e.surface_form}})
	return forms;
}

