import type { SignupFormPrivateProps } from './typings';
import type { VueFormProps } from '@/components/visual';
import { Validator } from '@vueform/vueform';

export function useVisualProps(props: SignupFormPrivateProps): VueFormProps {

    const containsOneUppercase = class extends Validator {
        check(value: string) {
            return /[A-Z]/.test(value);
        }
    }

    const containsOneLowercase = class extends Validator {
        check(value: string) {
            return /[a-z]/.test(value);
        }
    }

    const containsOneSpecialCharacter = class extends Validator {
        check(value: string) {
            return /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/.test(value);
        }
    }

    const containsOneNumber = class extends Validator {
        check(value: string) {
            return /[0-9]/.test(value);
        }
    }

    const schema: VueFormProps['schema'] = {
        email: { 
            type: 'text', 
            label: 'Email', 
            inputType: 'email', 
            rules: ['required', 'email'],
            messages: {
                required: 'Email is required',
                email: 'Please enter a valid email address'
            },
            addClass: 'email-input',
        },
        password: { 
            type: 'text', 
            inputType: 'password', 
            label: 'Password',
            addClass: 'password-input',
            rules: ['required', 'min:8', 'max:24', containsOneUppercase, containsOneLowercase, containsOneNumber, containsOneSpecialCharacter],
            messages: {
                required: 'Password is required',
                min: 'Password must be at least 8 characters long',
                max: 'Password must be at most 24 characters long',
                [containsOneUppercase.name]: 'Password must contain at least one uppercase letter',
                [containsOneLowercase.name]: 'Password must contain at least one lowercase letter',
                [containsOneNumber.name]: 'Password must contain at least one number',
                [containsOneSpecialCharacter.name]: 'Password must contain at least one special character',
            },
        },
        submit: { 
            type: 'button', 
            buttonLabel: 'Sign Up', 
            submits: true,
            addClass: 'submit-button',
        }
    };

    const endpoint: VueFormProps['endpoint'] = false;

    const handleSubmit = (data: any) => {
        const dataToSubmit = data.data;
        console.log(dataToSubmit);
        if (!dataToSubmit.email || !dataToSubmit.password) {
            console.error('Email and password are required');
            return;
        }
        return props.onSubmit(dataToSubmit);
    };

    return {
        schema,
        endpoint,
        onSubmit: handleSubmit,
        validateOn: 'blur',
    };
}

