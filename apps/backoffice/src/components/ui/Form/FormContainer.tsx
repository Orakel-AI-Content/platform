// Ecme v1.3.10 (e5f9a1d): src/components/ui/Form/FormContainer.tsx
'use client';

import { FormContextProvider, FormContextConsumer } from './context';
import { useConfig } from '../ConfigProvider';
import classNames from '../utils/classNames';
import { SIZES, LAYOUT } from '../utils/constants';
import type { FormContextProps } from './context';
import type { CommonProps, TypeAttributes } from '../@types/common';

export interface FormContainerProps extends CommonProps {
  size?: TypeAttributes.ControlSize;
  layout?: TypeAttributes.FormLayout;
  labelWidth?: string | number;
}

const FormContainer = (props: FormContainerProps) => {
  const { controlSize } = useConfig();

  const {
    children,
    className,
    labelWidth = 100,
    layout = LAYOUT.VERTICAL,
    size = SIZES.MD,
  } = props;

  const contextValue = {
    labelWidth,
    layout,
    size: size || controlSize,
  };

  return (
    <FormContextProvider value={contextValue as FormContextProps}>
      <FormContextConsumer>
        {(context) => {
          return (
            <div className={classNames('form-container', context?.layout, className)}>
              {children}
            </div>
          );
        }}
      </FormContextConsumer>
    </FormContextProvider>
  );
};

FormContainer.displayName = 'FormContainer';

export default FormContainer;
