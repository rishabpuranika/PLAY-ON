import { useNavigate } from 'react-router-dom';


// Types matching the GraphQL structure we just added
interface RelationNode {
    id: number;
    title: {
        romaji: string;
        english?: string;
        native?: string;
    };
    format?: string;
    type?: string;
    status?: string;
    coverImage?: {
        large: string;
        medium: string;
    };
}

interface RelationEdge {
    relationType: string;
    node: RelationNode;
}

interface MediaRelationsProps {
    relations?: {
        edges: RelationEdge[];
    };
}

export function MediaRelations({ relations }: MediaRelationsProps) {
    const navigate = useNavigate();

    // Filter out minimal/broken nodes if any
    const validEdges = relations?.edges.filter(edge => edge.node && edge.node.id) || [];

    if (validEdges.length === 0) return null;

    const handleRelationClick = (edge: RelationEdge) => {
        const type = edge.node.type === 'MANGA' ? 'manga-details' : 'anime';
        navigate(`/${type}/${edge.node.id}`);
    };

    return (
        <div className="mt-10 max-w-[1400px] mx-auto px-0 md:px-0">
            <div className="flex items-center gap-4 mb-6">
                <h2 className="text-2xl font-bold tracking-tight text-white">RELATED_SIGNALS</h2>
                <div className="h-px flex-1 bg-white/10" />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {validEdges.map((edge, index) => (
                    <div
                        key={`${edge.node.id}-${index}`}
                        className="group relative cursor-pointer"
                        onClick={() => handleRelationClick(edge)}
                    >
                        {/* Card Container */}
                        <div className="relative rounded-xl overflow-hidden aspect-[2/3] bg-white/5 border border-white/10 transition-transform duration-300 group-hover:scale-[1.02] shadow-sm group-hover:shadow-[0_0_20px_rgba(255,255,255,0.1)]">

                            {/* Image */}
                            <img
                                src={edge.node.coverImage?.large}
                                alt={edge.node.title.english || edge.node.title.romaji}
                                className="w-full h-full object-cover"
                                loading="lazy"
                            />

                            {/* Hover Overlay */}
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                                <span className="px-3 py-1 rounded-full border border-white/30 bg-white/10 backdrop-blur-md text-xs font-mono text-white">
                                    VIEW
                                </span>
                            </div>

                            {/* Relation Type Badge - Always Visible */}
                            <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-md border border-white/20">
                                <span className="text-[9px] font-bold text-mint-tonic uppercase tracking-wider">
                                    {edge.relationType.replace(/_/g, ' ')}
                                </span>
                            </div>

                            {/* Format Badge (TV, MANGA, etc) */}
                            <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-sm">
                                <span className="text-[9px] font-bold text-white/70 uppercase">
                                    {edge.node.format?.replace(/_/g, ' ') || edge.node.type}
                                </span>
                            </div>
                        </div>

                        {/* Title Below */}
                        <div className="mt-2 pl-1">
                            <h3 className="text-sm font-semibold text-gray-200 line-clamp-2 group-hover:text-mint-tonic transition-colors"
                                title={edge.node.title.english || edge.node.title.romaji}>
                                {edge.node.title.english || edge.node.title.romaji}
                            </h3>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs text-white/40 font-mono capitalize">
                                    {edge.node.status?.toLowerCase().replace(/_/g, ' ')}
                                </span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
