import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Text,
  useColorMode,
} from '@chakra-ui/react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export default function RegisterPage() {
  const { colorMode } = useColorMode();
  const navigate = useNavigate();

  const register = useAuthStore((s) => s.register);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const onSubmit = async (e) => {
    e.preventDefault();
    const ok = await register({ username, email, password });
    if (ok) navigate('/dashboard');
  };

  return (
    <Box
      bg={colorMode === 'dark' ? 'gray.800' : 'white'}
      p={8}
      borderRadius="lg"
      boxShadow="lg"
      maxW="480px"
      mx="auto"
    >
      <Heading size="lg" mb={6}>
        Register
      </Heading>

      <form onSubmit={onSubmit}>
        <FormControl mb={4} isRequired>
          <FormLabel>Username</FormLabel>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
        </FormControl>

        <FormControl mb={4} isRequired>
          <FormLabel>Email</FormLabel>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" />
        </FormControl>

        <FormControl mb={6} isRequired>
          <FormLabel>Password</FormLabel>
          <Input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="new-password"
          />
        </FormControl>

        {error ? (
          <Text color="red.300" mb={4}>
            {error}
          </Text>
        ) : null}

        <Button type="submit" colorScheme="brand" isLoading={loading} width="100%">
          Create account
        </Button>

        <Text mt={4} color={colorMode === 'dark' ? 'gray.300' : 'gray.600'}>
          Have an account? <Link to="/login">Login</Link>
        </Text>
      </form>
    </Box>
  );
}
