import {
  Box,
  Button,
  Divider,
  Heading,
  HStack,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  Spinner,
  Stack,
  Text,
  useColorMode,
  useDisclosure,
  useToast,
  VStack,
  IconButton,
  Badge,
  Flex,
  Grid,
  GridItem,
} from '@chakra-ui/react';
import {
  PlayIcon,
  StopIcon,
  ClockIcon,
  ArrowDownTrayIcon,
  PlusIcon,
  TrashIcon,
  PencilIcon,
  MusicalNoteIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import * as Tone from 'tone';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiRequest } from '../services/api';
import { socket } from '../services/socket';
import { useAuthStore } from '../store/authStore';

const STEPS = 16;
const STEP_SECONDS = 0.25;
const PITCHES = Array.from({ length: 13 }, (_, i) => 72 - i); 

function cellKey(pitch, step) {
  return `${pitch}:${step}`;
}

export default function ProjectPage() {
  const { colorMode } = useColorMode();
  const { id } = useParams();
  const token = useAuthStore((s) => s.token);

  const [error, setError] = useState('');
  const [project, setProject] = useState(null);

  const [active, setActive] = useState(() => new Set());
  const [isPlaying, setIsPlaying] = useState(false);

  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiSuggestion, setAiSuggestion] = useState(null);

  const [selectedTrackId, setSelectedTrackId] = useState('');
  const [trackNameModal, setTrackNameModal] = useState({ open: false, trackId: '', name: '' });
  const { isOpen: isAddTrackOpen, onOpen: onAddTrackOpen, onClose: onAddTrackClose } = useDisclosure();
  const [newTrackName, setNewTrackName] = useState('');

  const [versions, setVersions] = useState([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const { isOpen: isVersionsOpen, onOpen: onVersionsOpen, onClose: onVersionsClose } = useDisclosure();

  const synthRef = useRef(null);
  const partRef = useRef(null);
  const toast = useToast();

  const selectedTrack = useMemo(() => {
    return project?.tracks?.find((t) => String(t._id) === String(selectedTrackId));
  }, [project, selectedTrackId]);

  const trackId = selectedTrackId;

  const load = async () => {
    setError('');
    try {
      const p = await apiRequest(`/api/projects/${id}`, { token });
      setProject(p);
      const firstId = p?.tracks?.[0]?._id || '';
      setSelectedTrackId(firstId);

      const seeded = new Set();
      const track = p?.tracks?.find((t) => String(t._id) === String(firstId));
      if (track?.events?.length) {
        for (const ev of track.events) {
          if (ev?.type === 'note' && typeof ev.note === 'number' && typeof ev.time === 'number') {
            const step = Math.round(ev.time / STEP_SECONDS);
            if (step >= 0 && step < STEPS) seeded.add(cellKey(ev.note, step));
          }
        }
      }
      setActive(seeded);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const requestAi = async () => {
    setAiLoading(true);
    setAiError('');
    try {
      const pitchMin = PITCHES[PITCHES.length - 1];
      const pitchMax = PITCHES[0];

      const data = await apiRequest(`/api/projects/${id}/suggestions`, {
        method: 'POST',
        token,
        body: {
          prompt: aiPrompt,
          grid: {
            steps: STEPS,
            stepSeconds: STEP_SECONDS,
            pitchMin,
            pitchMax,
          },
        },
      });

      setAiSuggestion(data?.suggestion || null);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e));
      setAiSuggestion(null);
    } finally {
      setAiLoading(false);
    }
  };

  const applyAi = async () => {
    const notes = aiSuggestion?.notes;
    if (!Array.isArray(notes) || notes.length === 0) return;

    const current = project;
    const track = current?.tracks?.find((t) => String(t._id) === String(trackId));
    if (!current || !track) return;

    const nextActive = new Set(active);
    const toAdd = [];

    for (const n of notes) {
      const note = Number(n.note);
      const step = Number(n.step);
      const durationSteps = Math.max(1, Number(n.durationSteps || 1));
      if (!Number.isFinite(note) || !Number.isFinite(step)) continue;
      if (step < 0 || step >= STEPS) continue;

      const key = cellKey(note, step);
      if (nextActive.has(key)) continue;
      nextActive.add(key);
      toAdd.push({ note, step, durationSteps, velocity: Number(n.velocity || 100) });
    }

    if (toAdd.length === 0) return;

    const stepSeconds = STEP_SECONDS;
    const nextTracks = current.tracks.map((t) => {
      if (String(t._id) !== String(trackId)) return t;
      
      // Replace all note events with AI suggestions, keep non-note events
      const nonNoteEvents = (t.events || []).filter(event => event.type !== 'note');
      
      const appended = toAdd.map((n) => ({
        type: 'note',
        note: n.note,
        time: n.step * stepSeconds,
        duration: n.durationSteps * stepSeconds,
        trackId: t._id || trackId || 'track0',
        velocity: Math.max(1, Math.min(127, Math.round(n.velocity))),
      }));
      return { ...t, events: [...nonNoteEvents, ...appended] };
    });

    // Clear all active notes from the current track, then add new ones
    const clearedActive = new Set();
    toAdd.forEach(n => {
      const key = cellKey(n.note, n.step);
      clearedActive.add(key);
    });

    setActive(clearedActive);
    setProject({ ...current, tracks: nextTracks });

    for (const n of toAdd) {
      socket.emit('midiEvent', {
        projectId: id,
        event: {
          type: 'noteToggle',
          note: n.note,
          step: n.step,
          time: n.step * STEP_SECONDS,
          duration: n.durationSteps * STEP_SECONDS,
          trackId,
          velocity: Math.max(1, Math.min(127, Math.round(n.velocity))),
        },
      });
    }

    try {
      await apiRequest(`/api/projects/${id}`, {
        method: 'PUT',
        token,
        body: { tracks: nextTracks },
      });
    } catch {
      
    }
  };

  useEffect(() => {
    load();
    
  }, [id]);

  useEffect(() => {
    if (!id) return;

    if (!socket.connected) socket.connect();
    socket.emit('joinProject', id);

    const onRemote = (event) => {
      if (!event || event.type !== 'noteToggle') return;
      const { note, step } = event;
      if (typeof note !== 'number' || typeof step !== 'number') return;
      const key = cellKey(note, step);
      setActive((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    };

    socket.on('midiEvent', onRemote);
    return () => {
      socket.off('midiEvent', onRemote);
    };
  }, [id, selectedTrackId]);

  const rebuildPart = async () => {
    if (!synthRef.current) {
      synthRef.current = new Map();
    }

    if (partRef.current) {
      partRef.current.dispose();
      partRef.current = null;
    }

    const events = [];
    for (const track of project?.tracks || []) {
      const trackEvents = [];
      for (const ev of track.events || []) {
        if (ev?.type === 'note' && typeof ev.note === 'number' && typeof ev.time === 'number') {
          const time = ev.time;
          const note = Tone.Frequency(ev.note, 'midi').toNote();
          const velocity = ev.velocity || 100;
          trackEvents.push({ time, note, velocity, trackId: track._id });
        }
      }
      events.push(...trackEvents);
    }

    const part = new Tone.Part((time, value) => {
      let synth = synthRef.current.get(value.trackId);
      if (!synth) {
        const instrument = project?.tracks?.find((t) => t._id === value.trackId)?.instrument || 'synth';
        if (instrument === 'piano') {
          synth = new Tone.PolySynth(Tone.Synth).toDestination();
        } else if (instrument === 'bass') {
          synth = new Tone.PolySynth(Tone.MonoSynth).toDestination();
        } else if (instrument === 'lead') {
          synth = new Tone.PolySynth(Tone.FMSynth).toDestination();
        } else {
          synth = new Tone.PolySynth(Tone.Synth).toDestination();
        }
        synthRef.current.set(value.trackId, synth);
      }
      synth.triggerAttackRelease(value.note, STEP_SECONDS, time, value.velocity / 127);
    }, events);

    part.loop = true;
    part.loopEnd = STEPS * STEP_SECONDS;
    part.start(0);
    partRef.current = part;
  };

  const onPlay = async () => {
    try {
      await Tone.start();
      Tone.Transport.bpm.value = project?.bpm || 120;
      await rebuildPart();
      Tone.Transport.start();
      setIsPlaying(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onStop = () => {
    Tone.Transport.stop();
    setIsPlaying(false);
  };

  useEffect(() => {
    if (!isPlaying) return;
    rebuildPart();
    
  }, [active]);

  const toggleCell = async (pitch, step) => {
    const key = cellKey(pitch, step);
    const noteTime = step * STEP_SECONDS;

    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

    socket.emit('midiEvent', {
      projectId: id,
      event: {
        type: 'noteToggle',
        note: pitch,
        step,
        time: noteTime,
        duration: STEP_SECONDS,
        trackId,
        velocity: 100,
      },
    });

     try {
       const current = project;
       const track = current?.tracks?.find((t) => String(t._id) === String(trackId));
       if (!current || !track) return;

       const currentlyOn = active.has(key);
       const nextTracks = current.tracks.map((t, idx) => {
         if (String(t._id) !== String(trackId)) return t;
         const prevEvents = Array.isArray(t.events) ? t.events : [];

         const filtered = prevEvents.filter(
           (ev) => !(ev?.type === 'note' && ev?.note === pitch && ev?.time === noteTime)
         );

         const nextEvents = currentlyOn
           ? filtered
           : [
               ...filtered,
               {
                 type: 'note',
                 note: pitch,
                 time: noteTime,
                 duration: STEP_SECONDS,
                 trackId: t._id || trackId || 'track0',
                 velocity: 100,
               },
             ];

         return { ...t, events: nextEvents };
       });

       setProject({ ...current, tracks: nextTracks });

       await apiRequest(`/api/projects/${id}`, {
         method: 'PUT',
         token,
         body: { tracks: nextTracks },
       });
     } catch {
       
     }
  };

  const addTrack = async () => {
    if (!newTrackName.trim()) return;
    try {
      const current = project;
      const newTrack = {
        name: newTrackName.trim(),
        instrument: 'synth',
        events: [],
      };
      const nextTracks = [...(current.tracks || []), newTrack];
      setProject({ ...current, tracks: nextTracks });
      
      const addedTrack = nextTracks[nextTracks.length - 1];
      setSelectedTrackId(addedTrack._id || `temp_${Date.now()}`);
      await apiRequest(`/api/projects/${id}`, {
        method: 'PUT',
        token,
        body: { tracks: nextTracks },
      });
      
      await load();
      setNewTrackName('');
      onAddTrackClose();
      toast({
        title: 'Track added',
        description: `"${newTrack.name}" has been created`,
        status: 'success',
        duration: 2000,
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to add track',
        status: 'error',
        duration: 2000,
      });
    }
  };

  const onRenameTrackOpen = (trackId, currentName) => {
    setTrackNameModal({ open: true, trackId, name: currentName });
  };

  const renameTrack = async () => {
    const { trackId: tId, name } = trackNameModal;
    if (!name.trim()) return;
    try {
      const current = project;
      const nextTracks = current.tracks.map((t) =>
        String(t._id) === String(tId) ? { ...t, name: name.trim() } : t
      );
      setProject({ ...current, tracks: nextTracks });
      await apiRequest(`/api/projects/${id}`, {
        method: 'PUT',
        token,
        body: { tracks: nextTracks },
      });
      setTrackNameModal({ open: false, trackId: '', name: '' });
      toast({
        title: 'Track renamed',
        description: `Track renamed to "${name.trim()}"`,
        status: 'success',
        duration: 2000,
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to rename track',
        status: 'error',
        duration: 2000,
      });
    }
  };

  const deleteTrack = async (trackIdToDelete) => {
    if (!project || project.tracks.length <= 1) {
      toast({
        title: 'Cannot delete',
        description: 'You must have at least one track',
        status: 'warning',
        duration: 2000,
      });
      return;
    }
    try {
      const current = project;
      const trackToDelete = current.tracks.find((t) => String(t._id) === String(trackIdToDelete));
      const nextTracks = current.tracks.filter((t) => String(t._id) !== String(trackIdToDelete));
      setProject({ ...current, tracks: nextTracks });
      if (String(selectedTrackId) === String(trackIdToDelete)) {
        setSelectedTrackId(nextTracks[0]?._id || '');
      }
      await apiRequest(`/api/projects/${id}`, {
        method: 'PUT',
        token,
        body: { tracks: nextTracks },
      });
      toast({
        title: 'Track deleted',
        description: `"${trackToDelete?.name}" has been removed`,
        status: 'info',
        duration: 2000,
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to delete track',
        status: 'error',
        duration: 2000,
      });
    }
  };

  const changeTrackInstrument = async (trackIdToChange, instrument) => {
    try {
      const current = project;
      const nextTracks = current.tracks.map((t) =>
        String(t._id) === String(trackIdToChange) ? { ...t, instrument } : t
      );
      setProject({ ...current, tracks: nextTracks });
      await apiRequest(`/api/projects/${id}`, {
        method: 'PUT',
        token,
        body: { tracks: nextTracks },
      });
    } catch {
      
    }
  };

  const reloadActiveForTrack = () => {
    const track = project?.tracks?.find((t) => String(t._id) === String(selectedTrackId));
    const seeded = new Set();
    if (track?.events?.length) {
      for (const ev of track.events) {
        if (ev?.type === 'note' && typeof ev.note === 'number' && typeof ev.time === 'number') {
          const step = Math.round(ev.time / STEP_SECONDS);
          if (step >= 0 && step < STEPS) seeded.add(cellKey(ev.note, step));
        }
      }
    }
    setActive(seeded);
  };

  useEffect(() => {
    reloadActiveForTrack();
    
  }, [selectedTrackId]);

  const fetchVersions = async () => {
    setVersionsLoading(true);
    try {
      const v = await apiRequest(`/api/projects/${id}/versions`, { token });
      setVersions(v);
    } catch (e) {
      console.error('Failed to fetch versions', e);
    } finally {
      setVersionsLoading(false);
    }
  };

  const restoreVersion = async (versionId) => {
    try {
      await apiRequest(`/api/projects/${id}/versions/${versionId}/restore`, {
        method: 'POST',
        token,
      });
      
      await load();
      await fetchVersions();
    } catch (e) {
      console.error('Failed to restore version', e);
    }
  };

  useEffect(() => {
    if (isVersionsOpen) fetchVersions();
  }, [isVersionsOpen]);

  if (error) {
    return <Text color="red.300">{error}</Text>;
  }

  return (
    <HStack spacing={6} align="start" bg={colorMode === 'dark' ? '#0a0a0a' : 'gray.50'} minH="100vh" p={6}>
      {}
      <Box
        bg={colorMode === 'dark' ? '#141414' : 'white'}
        p={6}
        borderRadius="xl"
        boxShadow="0 8px 32px rgba(0,0,0,0.4)"
        minW="280px"
        border="1px solid #2a2a2a"
      >
        <HStack justify="space-between" mb={4}>
          <Heading size="sm" display="flex" alignItems="center" gap={2}>
            <MusicalNoteIcon width={16} height={16} />
            Tracks
          </Heading>
          <IconButton
            size="sm"
            aria-label="Add track"
            icon={<PlusIcon />}
            onClick={onAddTrackOpen}
            _hover={{ bg: '#00ff88', color: 'black' }}
            transition="all 0.2s"
          />
        </HStack>
        <VStack spacing={2} align="stretch">
          {project?.tracks?.map((track) => (
            <Box
              key={track._id}
              p={4}
              borderRadius="lg"
              border={String(selectedTrackId) === String(track._id) ? '2px solid' : '1px solid'}
              borderColor={String(selectedTrackId) === String(track._id) ? '#00ff88' : (colorMode === 'dark' ? '#1f1f1f' : 'gray.300')}
              cursor="pointer"
              onClick={() => setSelectedTrackId(track._id)}
              _hover={{
                borderColor: '#00ff88',
                bg: colorMode === 'dark' ? '#1a1a1a' : 'gray.100',
                transform: 'translateX(2px)',
                boxShadow: '0 4px 12px rgba(0, 255, 136, 0.1)',
              }}
              transition="all 0.2s"
              position="relative"
            >
              {String(selectedTrackId) === String(track._id) && (
                <Box
                  position="absolute"
                  left={-2}
                  top={0}
                  bottom={0}
                  width={3}
                  bg="linear-gradient(135deg, #00ff88, #00cc6a)"
                  borderRadius="lg"
                />
              )}
              <HStack justify="space-between" align="center">
                <Text fontSize="sm" fontWeight="medium" color={colorMode === 'dark' ? '#f0f0f0' : 'gray.800'}>{track.name}</Text>
                <HStack>
                  <IconButton
                    size="xs"
                    aria-label="Rename track"
                    icon={<PencilIcon />}
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRenameTrackOpen(track._id, track.name);
                    }}
                    _hover={{ bg: '#2a2a2a', color: '#00ff88' }}
                  />
                  <IconButton
                    size="xs"
                    aria-label="Delete track"
                    icon={<TrashIcon />}
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteTrack(track._id);
                    }}
                    isDisabled={project.tracks.length <= 1}
                    _hover={{ bg: '#ff4444', color: 'white' }}
                  />
                </HStack>
              </HStack>
              <Select
                size="xs"
                mt={3}
                value={track.instrument}
                onChange={(e) => {
                  e.stopPropagation();
                  changeTrackInstrument(track._id, e.target.value);
                }}
                onClick={(e) => e.stopPropagation()}
                bg="#1a1a1a"
                border="1px solid"
                borderColor="#1f1f1f"
                color="#f0f0f0"
                _hover={{ borderColor: '#00ff88' }}
                transition="all 0.2s"
              >
                <option value="synth" style={{ backgroundColor: '#141414', color: '#f0f0f0' }}>Synth</option>
                <option value="piano" style={{ backgroundColor: '#141414', color: '#f0f0f0' }}>Piano</option>
                <option value="bass" style={{ backgroundColor: '#141414', color: '#f0f0f0' }}>Bass</option>
                <option value="lead" style={{ backgroundColor: '#141414', color: '#f0f0f0' }}>Lead</option>
              </Select>
            </Box>
          ))}
        </VStack>
      </Box>

      {}
      <Stack spacing={6} flex={1}>
        {}
        <Box
          bg={colorMode === 'dark' ? '#141414' : 'white'}
          p={6}
          borderRadius="xl"
          boxShadow="0 8px 32px rgba(0,0,0,0.4)"
          border="1px solid #2a2a2a"
        >
          <HStack justify="space-between" align="start">
            <Box>
              <Heading size="md" color={colorMode === 'dark' ? '#f0f0f0' : 'gray.800'}>{project?.name || 'Project'}</Heading>
              <Text color={colorMode === 'dark' ? '#888888' : 'gray.600'} fontSize="sm">
                BPM: {project?.bpm || 120} | Steps: {STEPS} | Track: {selectedTrack?.name || 'None'}
              </Text>
            </Box>
            <HStack spacing={3}>
              <Button
                size="sm"
                variant="outline"
                leftIcon={<ClockIcon />}
                onClick={onVersionsOpen}
                bg="#1a1a1a"
                border="1px solid #1f1f1f"
                color="#f0f0f0"
                _hover={{ bg: '#2a2a2a', borderColor: '#00ff88' }}
                transition="all 0.2s"
              >
                History
              </Button>
              <Button
                size="sm"
                variant="outline"
                leftIcon={<ArrowDownTrayIcon />}
                onClick={async () => {
                  try {
                    const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/projects/${id}/export`, {
                      headers: token ? { 'x-auth-token': token } : {},
                    });
                    if (!res.ok) throw new Error(`Export failed (${res.status})`);

                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${project?.name || 'project'}-${Date.now()}.wav`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);
                  } catch (e) {
                    toast({
                      title: 'Export failed',
                      description: e instanceof Error ? e.message : String(e),
                      status: 'error',
                      duration: 3000,
                      isClosable: true,
                    });
                  }
                }}
                bg="#1a1a1a"
                border="1px solid #1f1f1f"
                color="#f0f0f0"
                _hover={{ bg: '#2a2a2a', borderColor: '#00ff88' }}
                transition="all 0.2s"
              >
                Export WAV
              </Button>
              {isPlaying ? (
                <Button
                  onClick={onStop}
                  variant="outline"
                  leftIcon={<StopIcon />}
                  bg="#ff4444"
                  border="1px solid #ff4444"
                  color="white"
                  _hover={{ bg: '#cc0000' }}
                  transition="all 0.2s"
                >
                  Stop
                </Button>
              ) : (
                <Button
                  onClick={onPlay}
                  bg="linear-gradient(135deg, #00ff88, #00cc6a)"
                  color="black"
                  leftIcon={<PlayIcon />}
                  _hover={{ transform: 'scale(1.05)', bg: 'linear-gradient(135deg, #00cc6a, #00aa55)' }}
                  transition="all 0.2s"
                  border="none"
                  fontWeight="bold"
                >
                  Play
                </Button>
              )}
            </HStack>
          </HStack>
        </Box>

        {}
        <Box
          bg={colorMode === 'dark' ? '#141414' : 'white'}
          p={6}
          borderRadius="xl"
          boxShadow="0 8px 32px rgba(0,0,0,0.4)"
          border="1px solid #2a2a2a"
        >
          <Heading size="sm" mb={4} display="flex" alignItems="center" gap={2} color={colorMode === 'dark' ? '#f0f0f0' : 'gray.800'}>
            <SparklesIcon width={16} height={16} color="#00ff88" />
            AI Suggestions
          </Heading>

          <Stack spacing={4}>
            <Input
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="e.g. Add a simple harmony in C major"
              bg={colorMode === 'dark' ? '#1a1a1a' : 'gray.100'}
              border="1px solid"
              borderColor={colorMode === 'dark' ? '#1f1f1f' : 'gray.300'}
              color={colorMode === 'dark' ? '#f0f0f0' : 'gray.800'}
              _placeholder={{ color: colorMode === 'dark' ? '#666666' : 'gray.500' }}
              _hover={{ borderColor: '#00ff88' }}
              _focus={{ borderColor: '#00ff88', boxShadow: '0 0 0 1px #00ff88' }}
              transition="all 0.2s"
            />
            <HStack spacing={3}>
              <Button
                onClick={requestAi}
                isLoading={aiLoading}
                bg="linear-gradient(135deg, #00ff88, #00cc6a)"
                color="black"
                leftIcon={<SparklesIcon />}
                _hover={{ transform: 'scale(1.02)', bg: 'linear-gradient(135deg, #00cc6a, #00aa55)' }}
                transition="all 0.2s"
                border="none"
                fontWeight="bold"
              >
                Ask AI
              </Button>
              <Button
                onClick={applyAi}
                variant="outline"
                isDisabled={!aiSuggestion || !aiSuggestion?.notes?.length}
                bg={colorMode === 'dark' ? '#1a1a1a' : 'gray.100'}
                border="1px solid"
                borderColor={colorMode === 'dark' ? '#1f1f1f' : 'gray.300'}
                color={colorMode === 'dark' ? '#f0f0f0' : 'gray.800'}
                _hover={{ bg: '#00ff88', borderColor: '#00ff88', color: 'black' }}
                transition="all 0.2s"
              >
                Apply
              </Button>
            </HStack>

            {aiError ? (
              <Box p={3} bg="#ff4444" bgOpacity="10%" borderRadius="md" border="1px solid" borderColor="#ff4444">
                <Text color="#ff8888" fontSize="sm">{aiError}</Text>
              </Box>
            ) : null}

            {aiSuggestion ? (
              <Box
                p={4}
                bg="#1a1a1a"
                borderRadius="lg"
                border="1px solid"
                borderColor="#1f1f1f"
              >
                <VStack align="start" spacing={2}>
                  <Text fontWeight="semibold" display="flex" alignItems="center" gap={2} color={colorMode === 'dark' ? '#cccccc' : 'gray.600'}>
                    <SparklesIcon width={14} height={14} color="#00ff88" />
                    {aiSuggestion.title || 'Suggestion'}
                  </Text>
                  {aiSuggestion.description ? (
                    <Text color={colorMode === 'dark' ? '#cccccc' : 'gray.600'} fontSize="sm">
                      {aiSuggestion.description}
                    </Text>
                  ) : null}
                  <Badge bg="#00ff88" color="black" variant="solid">
                    {Array.isArray(aiSuggestion.notes) ? aiSuggestion.notes.length : 0} notes
                  </Badge>
                  {aiSuggestion.raw ? (
                    <Text fontSize="xs" color="#666666" mt={2}>
                      {String(aiSuggestion.raw).slice(0, 240)}
                    </Text>
                  ) : null}
                </VStack>
              </Box>
            ) : null}
          </Stack>
        </Box>

        {}
        <Box
          bg={colorMode === 'dark' ? '#141414' : 'white'}
          p={6}
          borderRadius="xl"
          boxShadow="0 8px 32px rgba(0,0,0,0.4)"
          border="1px solid #2a2a2a"
          overflowX="auto"
        >
          <Heading size="sm" mb={4} display="flex" alignItems="center" gap={2} color={colorMode === 'dark' ? '#f0f0f0' : 'gray.800'}>
            <MusicalNoteIcon width={16} height={16} color="#00ff88" />
            Piano Roll – {selectedTrack?.name || 'Select a track'}
          </Heading>

          <Box
            display="grid"
            gridTemplateColumns={`80px repeat(${STEPS}, 32px)`}
            gap="2px"
            alignItems="center"
          >
            <Box />
            {Array.from({ length: STEPS }, (_, s) => (
              <Box
                key={`h:${s}`}
                fontSize="xs"
                textAlign="center"
                color={colorMode === 'dark' ? '#666666' : 'gray.600'}
                fontWeight={s % 4 === 0 ? 'bold' : 'normal'}
              >
                {s + 1}
              </Box>
            ))}

            {PITCHES.map((pitch) => {
              const noteName = Tone.Frequency(pitch, 'midi').toNote();
              const isBlackKey = noteName.includes('#');
              return (
                <Box key={`row:${pitch}`} display="contents">
                  <Box
                    fontSize="sm"
                    pr={2}
                    textAlign="right"
                    color={isBlackKey ? (colorMode === 'dark' ? '#555555' : 'gray.500') : (colorMode === 'dark' ? '#888888' : 'gray.700')}
                    fontWeight={isBlackKey ? 'normal' : 'semibold'}
                  >
                    {noteName}
                  </Box>

                  {Array.from({ length: STEPS }, (_, step) => {
                    const key = cellKey(pitch, step);
                    const on = active.has(key);
                    const isBeat = step % 4 === 0;
                    return (
                      <Box
                        key={`${pitch}:${step}`}
                        height="28px"
                        borderRadius="6px"
                        cursor="pointer"
                        onClick={() => toggleCell(pitch, step)}
                        background={
                          on
                            ? 'linear-gradient(135deg, #00ff88, #00cc6a)'
                            : isBeat
                              ? (colorMode === 'dark' ? '#1f1f1f' : 'gray.200')
                              : (colorMode === 'dark' ? '#1a1a1a' : 'gray.100')
                        }
                        border={isBeat ? `1px solid ${colorMode === 'dark' ? '#2a2a2a' : 'gray.300'}` : 'none'}
                        _hover={{
                          opacity: on ? 0.9 : 0.7,
                          transform: 'scale(1.1)',
                          boxShadow: '0 2px 8px rgba(0, 255, 136, 0.3)',
                        }}
                        transition="all 0.15s ease"
                        position="relative"
                      >
                        {on && (
                          <Box
                            position="absolute"
                            top={1}
                            left={1}
                            right={1}
                            bottom={1}
                            bg="white"
                            opacity={0.2}
                            borderRadius="4px"
                          />
                        )}
                      </Box>
                    );
                  })}
                </Box>
              );
            })}
          </Box>
        </Box>
      </Stack>

      {}
      <Modal isOpen={isAddTrackOpen} onClose={onAddTrackClose} size="sm">
        <ModalOverlay bg="rgba(0,0,0,0.9)" />
        <ModalContent bg="#141414" border="1px solid #2a2a2a" borderRadius="xl">
          <ModalHeader display="flex" alignItems="center" gap={2} color="#f0f0f0">
            <PlusIcon width={20} height={20} color="#00ff88" />
            Add Track
          </ModalHeader>
          <ModalCloseButton color="#888888" />
          <ModalBody>
            <Input
              placeholder="Enter track name"
              value={newTrackName}
              onChange={(e) => setNewTrackName(e.target.value)}
              bg="#1a1a1a"
              border="1px solid"
              borderColor="#1f1f1f"
              color="#f0f0f0"
              _placeholder={{ color: '#666666' }}
              _focus={{ borderColor: '#00ff88', boxShadow: '0 0 0 1px #00ff88' }}
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onAddTrackClose} color={colorMode === 'dark' ? '#888888' : 'gray.600'} _hover={{ bg: colorMode === 'dark' ? '#1a1a1a' : 'gray.100' }}>Cancel</Button>
            <Button 
              bg="linear-gradient(135deg, #00ff88, #00cc6a)"
              color="black"
              onClick={addTrack} 
              isDisabled={!newTrackName.trim()}
              leftIcon={<PlusIcon />}
              _hover={{ transform: 'scale(1.02)', bg: 'linear-gradient(135deg, #00cc6a, #00aa55)' }}
              border="none"
              fontWeight="bold"
            >
              Add Track
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {}
      <Modal
        isOpen={trackNameModal.open}
        onClose={() => setTrackNameModal({ open: false, trackId: '', name: '' })}
        size="sm"
      >
        <ModalOverlay bg="rgba(0,0,0,0.9)" />
        <ModalContent bg="#141414" border="1px solid #2a2a2a" borderRadius="xl">
          <ModalHeader display="flex" alignItems="center" gap={2} color="#f0f0f0">
            <PencilIcon width={20} height={20} color="#00ff88" />
            Rename Track
          </ModalHeader>
          <ModalCloseButton color="#888888" />
          <ModalBody>
            <Input
              placeholder="New track name"
              value={trackNameModal.name}
              onChange={(e) => setTrackNameModal({ ...trackNameModal, name: e.target.value })}
              bg="#1a1a1a"
              border="1px solid"
              borderColor="#1f1f1f"
              color="#f0f0f0"
              _placeholder={{ color: '#666666' }}
              _focus={{ borderColor: '#00ff88', boxShadow: '0 0 0 1px #00ff88' }}
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={() => setTrackNameModal({ open: false, trackId: '', name: '' })} color={colorMode === 'dark' ? '#888888' : 'gray.600'} _hover={{ bg: colorMode === 'dark' ? '#1a1a1a' : 'gray.100' }}>
              Cancel
            </Button>
            <Button 
              bg="linear-gradient(135deg, #00ff88, #00cc6a)"
              color="black"
              onClick={renameTrack} 
              isDisabled={!trackNameModal.name.trim()}
              leftIcon={<PencilIcon />}
              _hover={{ transform: 'scale(1.02)', bg: 'linear-gradient(135deg, #00cc6a, #00aa55)' }}
              border="none"
              fontWeight="bold"
            >
              Rename
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {}
      <Modal isOpen={isVersionsOpen} onClose={onVersionsClose} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Project History</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {versionsLoading ? (
              <HStack>
                <Spinner size="sm" />
                <Text>Loading versions...</Text>
              </HStack>
            ) : versions.length === 0 ? (
              <Text>No versions yet.</Text>
            ) : (
              <Stack spacing={3}>
                {versions.map((v) => (
                  <Box
                    key={v._id}
                    p={3}
                    border="1px solid"
                    borderColor={colorMode === 'dark' ? 'gray.600' : 'gray.200'}
                    borderRadius="md"
                  >
                    <HStack justify="space-between" align="center">
                      <Box>
                        <Text fontWeight="semibold">Version {v.version}</Text>
                        <Text fontSize="sm" color={colorMode === 'dark' ? 'gray.300' : 'gray.600'}>
                          {v.description}
                        </Text>
                        <Text fontSize="xs" color={colorMode === 'dark' ? 'gray.400' : 'gray.500'}>
                          {new Date(v.createdAt).toLocaleString()} by {v.createdBy?.username || 'Unknown'}
                        </Text>
                      </Box>
                      <Button
                        size="sm"
                        onClick={() => restoreVersion(v._id)}
                        isDisabled={v.version === versions[0]?.version}
                      >
                        Restore
                      </Button>
                    </HStack>
                  </Box>
                ))}
              </Stack>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onClick={onVersionsClose}>Close</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </HStack>
  );
}
