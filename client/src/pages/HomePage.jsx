import { Box, Button, Heading, Text, useColorMode } from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';

export default function HomePage() {
  const navigate = useNavigate();
  const { colorMode } = useColorMode();

  return (
    <Box
      bg={colorMode === 'dark' ? 'gray.800' : 'white'}
      p={8}
      borderRadius="lg"
      boxShadow="lg"
      textAlign="center"
    >
      <Heading as="h1" size="2xl" mb={4} color={colorMode === 'dark' ? 'white' : 'gray.800'}>
        Real-Time Music Collaboration
      </Heading>
      <Text fontSize="xl" mb={8} color={colorMode === 'dark' ? 'gray.300' : 'gray.600'}>
        Create, collaborate, and make music together in real-time
      </Text>
      <Button colorScheme="brand" size="lg" onClick={() => navigate('/dashboard')}>
        Get Started
      </Button>
    </Box>
  );
}
