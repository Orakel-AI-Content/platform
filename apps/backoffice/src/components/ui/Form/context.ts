// Ecme v1.3.10 (e5f9a1d): src/components/ui/Form/context.ts
// Adaptado (#207): o contexto do FormItem leva também `controlId` (o id do campo, para o
// rótulo) e `errorId` (o id da mensagem de erro, para o `aria-describedby`), que o Input lê;
// e (#329) `hintId`, o id da dica do campo, também para o `aria-describedby`.
'use client';

import { createContext, useContext } from 'react';
import type { TypeAttributes } from '../@types/common';

export type FormContextProps = {
  size?: TypeAttributes.ControlSize;
  layout?: TypeAttributes.FormLayout;
  labelWidth?: string | number;
};

const FormContext = createContext<FormContextProps | null>(null);

export const FormContextProvider = FormContext.Provider;

export const FormContextConsumer = FormContext.Consumer;

export function useForm() {
  return useContext(FormContext);
}

export type FormItemContextProps = {
  invalid?: boolean;
  controlId?: string;
  errorId?: string;
  hintId?: string;
};

const FormItemContext = createContext<FormItemContextProps | null>(null);

export const FormItemContextProvider = FormItemContext.Provider;

export const FormItemContextConsumer = FormItemContext.Consumer;

export function useFormItem() {
  return useContext(FormItemContext);
}

export default FormContext;
