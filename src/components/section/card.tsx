import type { NewsItem, SourceID, SourceInfo, SourceResponse } from "@shared/types"
import type { UseQueryResult } from "@tanstack/react-query"
import { useQuery } from "@tanstack/react-query"
import clsx from "clsx"
import { useInView } from "react-intersection-observer"
import { useAtom } from "jotai"
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react"
import { sources } from "@shared/sources"
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities"
import { ofetch } from "ofetch"
import { OverlayScrollbar } from "../common/overlay-scrollbar"
import { focusSourcesAtom, refetchSourcesAtom } from "~/atoms"
import { useRelativeTime } from "~/hooks/useRelativeTime"

export interface ItemsProps extends React.HTMLAttributes<HTMLDivElement> {
  id: SourceID
  /**
   * 是否显示透明度，拖动时原卡片的样式
   */
  isDragged?: boolean
  isOverlay?: boolean
  handleListeners?: SyntheticListenerMap
}

interface NewsCardProps {
  id: SourceID
  inView: boolean
  isOverlay?: boolean
  handleListeners?: SyntheticListenerMap
}

interface Query {
  query: UseQueryResult<SourceInfo, Error>
}

export const CardWrapper = forwardRef<HTMLDivElement, ItemsProps>(({ id, isDragged, isOverlay, handleListeners, style, ...props }, dndRef) => {
  const ref = useRef<HTMLDivElement>(null)
  const { ref: inViewRef, inView } = useInView({
    threshold: 0,
  })

  useImperativeHandle(dndRef, () => ref.current!)
  useImperativeHandle(inViewRef, () => ref.current!)

  return (
    <div
      ref={ref}
      className={clsx(
        "flex flex-col h-550px rounded-2xl bg-blue bg-op-50 p-4 backdrop-blur-5",
        "shadow-base",
        isDragged && "op-50",
        isOverlay ? "backdrop-blur-5 bg-op-40" : "",
      )}
      style={{
        transformOrigin: "50% 50%",
        ...style,
      }}
      {...props}
    >
      <NewsCard id={id} inView={inView} isOverlay={isOverlay} handleListeners={handleListeners} />
    </div>
  )
})

export function NewsCard({ id, inView, isOverlay, handleListeners }: NewsCardProps) {
  const [focusSources, setFocusSources] = useAtom(focusSourcesAtom)
  const [refetchSource, setRefetchSource] = useAtom(refetchSourcesAtom)
  const query = useQuery({
    queryKey: [id, refetchSource[id]],
    queryFn: async ({ queryKey }) => {
      const [_id, _refetchTime] = queryKey as [SourceID, number]
      let url = `/api/${_id}`
      if (Date.now() - _refetchTime < 1000) {
        url = `/api/${_id}?latest`
      }
      const response: SourceResponse = await ofetch(url, { timeout: 5000 })
      if (response.status === "error") {
        throw new Error(response.message)
      } else {
        return response.data
      }
    },
    // refetch 时显示原有的数据
    placeholderData: prev => prev,
    staleTime: 1000 * 60 * 5,
    enabled: inView,
  })

  const addFocusList = useCallback(() => {
    setFocusSources(focusSources.includes(id) ? focusSources.filter(i => i !== id) : [...focusSources, id])
  }, [setFocusSources, focusSources, id])
  const manualRefetch = useCallback(() => {
    setRefetchSource(prev => ({
      ...prev,
      [id]: Date.now(),
    }))
  }, [setRefetchSource, id])

  return (
    <>
      <div className={clsx("flex justify-between m-4 mt-0 items-center")}>
        <div className="flex gap-2 items-center">
          <img
            src={`/icons/${id.split("-")[0]}.png`}
            className={clsx("h-8 rounded-full")}
            alt={id}
            onError={e => e.currentTarget.src = "/icons/default.png"}
          />
          <span className="flex flex-col">
            <span className="flex items-center gap-2">
              <span className="text-xl font-bold">
                {sources[id].name}
              </span>
              {sources[id]?.title && <span className="text-sm">{sources[id].title}</span>}
            </span>
            <span className="text-xs"><UpdateTime query={query} /></span>
          </span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className={clsx("i-ph:arrow-counter-clockwise-duotone", query.isFetching && "animate-spin i-ph:circle-dashed-duotone")}
            onClick={manualRefetch}
          />
          <button
            type="button"
            className={clsx(focusSources.includes(id) ? "i-ph:star-fill" : "i-ph:star-duotone")}
            onClick={addFocusList}
          />
          <button
            {...handleListeners}
            type="button"
            className={clsx("i-ph:dots-six-vertical-duotone", handleListeners && "cursor-grab", isOverlay && "cursor-grabbing")}
          />
        </div>
      </div>
      <NewsList query={query} />
    </>
  )
}

function UpdateTime({ query }: Query) {
  const updatedTime = useRelativeTime(query.data?.updatedTime ?? "")
  if (updatedTime) return `${updatedTime}更新`
  if (query.isError) return "获取失败"
  return "加载中..."
}

function Num({ num }: { num: number }) {
  return (
    <span className={clsx("bg-gray/10 min-w-6 flex justify-center items-center rounded-md")}>
      {num}
    </span>
  )
}

function ExtraInfo({ item }: { item: NewsItem }) {
  const relativeTime = useRelativeTime(item?.extra?.date)
  if (item?.extra?.info) {
    return <>{item.extra.info}</>
  }

  if (item?.extra?.icon) {
    return <img src={item.extra.icon} className="w-5 inline" onError={e => e.currentTarget.hidden = true} />
  }

  if (relativeTime) {
    return <>{relativeTime}</>
  }
}

function NewsList({ query }: Query) {
  const items = query.data?.items
  return (
    <OverlayScrollbar
      className="h-full pl-2 pr-3 mr-1 py-2 overflow-x-auto bg-base rounded-2xl"
      options={{
        overflow: { x: "hidden" },
      }}
    >
      {items?.slice(0, 20).map((item, i) => (
        <div key={item.title} className="flex gap-2 items-center">
          <Num num={i + 1} />
          <a href={item.url} target="_blank" className="my-1">
            <span className="mr-2">
              {item.title}
            </span>
            <span className="text-xs text-gray-4/80 truncate align-middle">
              <ExtraInfo item={item} />
            </span>
          </a>
        </div>
      ))}
    </OverlayScrollbar>
  )
}
