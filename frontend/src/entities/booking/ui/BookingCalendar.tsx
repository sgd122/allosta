'use client';

import { useMemo, useState } from 'react';
import { Box, Button, Callout, Card, Flex, Heading, Spinner, Text } from '@radix-ui/themes';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
} from '@radix-ui/react-icons';
import { formatTime } from '@/shared/lib/format';
import type { BookingCalendarProps, DayCellProps, TimeButtonProps } from '../types';
import {
  buildMonthGrid,
  currentMonthKey,
  earliestMonth,
  formatMonthLabel,
  indexByDate,
  isMonthBefore,
  latestMonth,
  shiftMonth,
  weekdayLabels,
  type MonthKey,
} from './calendar-utils';

export function BookingCalendar({
  calendar,
  isLoading,
  isError,
  errorMessage,
  onPickSlot,
}: BookingCalendarProps) {
  const days = useMemo(() => calendar ?? [], [calendar]);
  const byDate = useMemo(() => indexByDate(days), [days]);

  const initialMonth = useMemo<MonthKey>(() => earliestMonth(days) ?? currentMonthKey(), [days]);
  const [viewMonth, setViewMonth] = useState<MonthKey>(initialMonth);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const grid = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);

  const minMonth = useMemo(() => earliestMonth(days), [days]);
  const maxMonth = useMemo(() => latestMonth(days), [days]);
  const prevDisabled = minMonth ? isMonthBefore(shiftMonth(viewMonth, -1), minMonth) : true;
  const nextDisabled = maxMonth ? !isMonthBefore(viewMonth, maxMonth) : true;

  function goPrev() {
    const next = shiftMonth(viewMonth, -1);
    if (minMonth && isMonthBefore(next, minMonth)) return;
    setViewMonth(next);
    setSelectedDate(null);
  }

  function goNext() {
    const next = shiftMonth(viewMonth, 1);
    if (maxMonth && isMonthBefore(maxMonth, next)) return;
    setViewMonth(next);
    setSelectedDate(null);
  }

  const selectedDay = selectedDate ? byDate.get(selectedDate) : undefined;
  const selectedSlots = selectedDay?.slots ?? [];

  return (
    <Box className="min-w-0 flex-1">
      <Flex align="center" gap="3" mb="4">
        <Heading as="h2" size="4" className="font-serif font-medium">
          예약 가능한 날짜
        </Heading>
        {isLoading && <Spinner size="1" />}
      </Flex>

      {isError && (
        <Callout.Root color="red" mb="4">
          <Callout.Icon><ExclamationTriangleIcon /></Callout.Icon>
          <Callout.Text>{errorMessage}</Callout.Text>
        </Callout.Root>
      )}

      {isLoading && !calendar && (
        <Card size="4">
          <Flex justify="center" py="8">
            <Spinner size="3" />
          </Flex>
        </Card>
      )}

      {!isLoading && !isError && days.length === 0 && (
        <Card size="4" className="text-center">
          <Text size="2" color="gray">현재 예약 가능한 날짜가 없습니다. 잠시 후 다시 확인해 주세요.</Text>
        </Card>
      )}

      {!isError && days.length > 0 && (
        <Card size="4" className="rise">
          <Flex align="center" justify="between" mb="4">
            <Button
              variant="soft"
              color="gray"
              size="2"
              onClick={goPrev}
              disabled={prevDisabled}
              aria-label="이전 달"
            >
              <ChevronLeftIcon />
            </Button>
            <Text size="3" weight="medium" className="font-mono tracking-[0.04em]">
              {formatMonthLabel(viewMonth)}
            </Text>
            <Button
              variant="soft"
              color="gray"
              size="2"
              onClick={goNext}
              disabled={nextDisabled}
              aria-label="다음 달"
            >
              <ChevronRightIcon />
            </Button>
          </Flex>

          <Box role="presentation" className="mb-2 grid grid-cols-7 gap-1.5">
            {weekdayLabels().map((label, i) => (
              <Text
                key={label}
                size="1"
                align="center"
                className={`font-mono tracking-[0.06em] ${
                  i === 0 ? 'text-red-9' : i === 6 ? 'text-blue-9' : 'text-gray-9'
                }`}
              >
                {label}
              </Text>
            ))}
          </Box>

          <Box role="grid" aria-label="예약 가능 날짜 달력" className="grid grid-cols-7 gap-1.5">
            {grid.map((cell) => {
              const dayData = byDate.get(cell.date);
              const slotCount = dayData?.slots.length ?? 0;
              const isAvailable = cell.inCurrentMonth && !cell.isPast && slotCount > 0;
              const isSelected = cell.date === selectedDate;

              return (
                <DayCell
                  key={cell.date}
                  dayOfMonth={cell.dayOfMonth}
                  muted={!cell.inCurrentMonth}
                  isToday={cell.isToday}
                  isAvailable={isAvailable}
                  isSelected={isSelected}
                  slotCount={slotCount}
                  onSelect={() => setSelectedDate(cell.date)}
                />
              );
            })}
          </Box>
        </Card>
      )}

      {selectedDay && (
        <Box mt="5" className="rise">
          <Flex align="center" gap="2" mb="3">
            <Text size="1" weight="bold" className="font-mono uppercase tracking-[0.1em] text-teal-11">
              {labelForDate(selectedDay.date)} · 가능 시간
            </Text>
          </Flex>

          {selectedSlots.length === 0 ? (
            <Card size="3" className="text-center">
              <Text size="2" color="gray">이 날짜에는 남은 시간이 없습니다.</Text>
            </Card>
          ) : (
            <Box className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5">
              {selectedSlots.map((slot) => (
                <TimeButton key={slot.slotId} slot={slot} onPick={() => onPickSlot(slot)} />
              ))}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

function labelForDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' }).format(
    new Date(y, m - 1, d),
  );
}

function DayCell({ dayOfMonth, muted, isToday, isAvailable, isSelected, slotCount, onSelect }: DayCellProps) {
  const surface = isSelected
    ? 'border-teal-9 bg-teal-9'
    : isAvailable
      ? 'border-teal-6 bg-teal-3'
      : isToday
        ? 'border-gray-7 bg-transparent'
        : 'border-transparent bg-transparent';
  const numberColor = isSelected
    ? 'text-white'
    : muted
      ? 'text-gray-6'
      : isAvailable
        ? 'text-teal-12'
        : 'text-gray-9';

  return (
    <button
      type="button"
      disabled={!isAvailable}
      onClick={onSelect}
      aria-label={isAvailable ? `${dayOfMonth}일, 예약 가능 ${slotCount}개` : `${dayOfMonth}일, 예약 불가`}
      aria-pressed={isSelected}
      className={[
        'relative flex aspect-square flex-col items-center justify-center gap-1',
        'rounded-3 border border-solid',
        'transition-[transform,background-color,border-color] duration-150 ease-out-expo',
        surface,
        isAvailable ? 'cursor-pointer' : 'cursor-default',
        !isAvailable && !isToday ? 'opacity-[0.55]' : 'opacity-100',
        isAvailable && !isSelected ? 'hover:-translate-y-0.5' : '',
      ].join(' ')}
    >
      <Text
        size="2"
        className={`font-mono leading-none ${isAvailable || isSelected ? 'font-semibold' : 'font-normal'} ${numberColor}`}
      >
        {dayOfMonth}
      </Text>
      {isAvailable && (
        <Box
          aria-hidden="true"
          className={`h-[5px] w-[5px] rounded-full ${isSelected ? 'bg-white' : 'bg-teal-9'}`}
        />
      )}
    </button>
  );
}

function TimeButton({ slot, onPick }: TimeButtonProps) {
  const range = `${formatTime(slot.startAt)}–${formatTime(slot.endAt)}`;
  return (
    <Card size="2" variant="surface">
      <Flex direction="column" gap="2" align="start">
        <Flex align="center" justify="between" width="100%" gap="2">
          <Text size="3" className="font-mono font-medium tracking-[0.02em]">{range}</Text>
          <Text size="1" color="gray" className="font-mono">상담사 {slot.availableCount}명</Text>
        </Flex>
        <Button size="1" variant="solid" color="teal" onClick={onPick} aria-label={`${range} 예약하기`} className="w-full">
          예약하기
        </Button>
      </Flex>
    </Card>
  );
}
